"""Database glue for Intent Sentinel: sessions, per-action recording, predictions and intent alerts."""
from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func, select

from app import config
from app.models.records import AgentSession, Alert, IntentPrediction, SessionAction, utcnow
from app.sentinel.audit import append
from app.sentinel.intent_engine import assess
from app.sentinel.intent_rules import RISK_ORDER
from app.sentinel.session_context import action_record, build_session_context

INTENT_KEYS = ('predicted_intent', 'intent_label', 'categories', 'primary_category', 'confidence', 'risk_level',
               'session_risk', 'purpose_alignment', 'intent_drift', 'drift_alert', 'evidence', 'reasoning_summary',
               'predicted_next_actions', 'recommended_response', 'enforcement', 'quarantine', 'deterministic_signal',
               'rule_hits', 'patterns', 'attack_chain', 'evaluator', 'predictive_blocking', 'actions_considered')


def compact(assessment: dict) -> dict:
    return {k: assessment[k] for k in INTENT_KEYS if k in assessment}


def open_session(db, agent):
    return db.scalar(select(AgentSession).where(AgentSession.agent_id == agent.id, AgentSession.status != 'CLOSED')
                     .order_by(AgentSession.start_time.desc()).limit(1))


def create_session(db, agent, user_objective: str = '', session_id: str | None = None) -> AgentSession:
    session = AgentSession(session_id=session_id or f'ses-{uuid4().hex[:12]}', agent_id=agent.id,
                           declared_purpose=agent.purpose, user_objective=user_objective[:1000],
                           status='QUARANTINED' if agent.status == 'QUARANTINED' else 'ACTIVE')
    db.add(session)
    db.flush()
    append(db, {'kind': 'session_started', 'agent_id': agent.id, 'session_id': session.session_id,
                'declared_purpose': agent.purpose, 'user_objective': session.user_objective})
    return session


def resolve_session(db, agent, request) -> AgentSession:
    """Explicit session_id if given; otherwise the agent's open session; otherwise a new one."""
    objective = str(request.context.get('user_objective') or request.task)
    if request.session_id:
        session = db.get(AgentSession, request.session_id)
        if session is None:
            return create_session(db, agent, objective, request.session_id)
        if session.agent_id != agent.id:
            raise HTTPException(409, 'This session belongs to a different agent.')
        return session
    return open_session(db, agent) or create_session(db, agent, objective)


def next_index(db, session) -> int:
    return (db.scalar(select(func.max(SessionAction.sequence_index)).where(
        SessionAction.session_id == session.session_id)) or 0) + 1


def assess_current(db, session, request, policy_result, behavior_score) -> dict:
    current = action_record(request.tool, request.resource, request.operation, decision=policy_result['decision'],
                            index=next_index(db, session), policy_decision=policy_result['decision'],
                            blocked=policy_result['decision'] == 'BLOCK', current=True)
    context = build_session_context(db, session.session_id, current, behavior_score)
    return assess(context)


def _summary(arguments: dict) -> str:
    text = ', '.join(f'{k}={str(v)[:40]}' for k, v in list(arguments.items())[:4])
    return text[:200]


def record(db, session, agent, event, request, policy_result, decision, risk, assessment, settings, index):
    """Persist the action into the session, store the prediction, update session state, alert if needed."""
    db.add(SessionAction(action_id=event.id, session_id=session.session_id, timestamp=event.timestamp, tool=request.tool,
                         operation=request.operation, resource=request.resource,
                         arguments_summary=_summary(event.payload['action'].get('arguments', {})),
                         result='executed' if event.payload['executed'] else 'not executed',
                         policy_decision=policy_result['decision'], final_decision=decision, risk_score=risk['score'],
                         session_risk=assessment['session_risk'], blocked=decision == 'BLOCK', sequence_index=index))
    store_prediction(db, session, assessment, index)
    if agent.status == 'QUARANTINED':
        session.status = 'QUARANTINED'
    elif session.status != 'QUARANTINED':
        session.status = ('REVIEW' if decision == 'REVIEW' or assessment['enforcement'] == 'REVIEW' else
                          'WATCH' if assessment['enforcement'] == 'WATCH' or assessment['risk_level'] != 'LOW' else 'ACTIVE')
    return intent_alert_payload(db, session, agent, event, assessment, settings)


def store_prediction(db, session, assessment, index) -> IntentPrediction:
    prediction = IntentPrediction(
        prediction_id=str(uuid4()), session_id=session.session_id, sequence_index=index,
        predicted_intent=assessment['predicted_intent'][:500], intent_category=assessment['categories'],
        confidence=assessment['confidence'], risk_level=assessment['risk_level'],
        session_risk=assessment['session_risk'], purpose_alignment=assessment['purpose_alignment'],
        intent_drift=assessment['intent_drift'],
        evidence_actions=[m for h in assessment['rule_hits'] for m in h['matched_actions']][:12],
        reasoning_summary=assessment['reasoning_summary'][:2000],
        predicted_next_actions=assessment['predicted_next_actions'],
        recommended_response=assessment['recommended_response'],
        model_provider=assessment['evaluator']['provider'], model_version=assessment['evaluator']['model_version'],
        details={'intent_label': assessment['intent_label'], 'enforcement': assessment['enforcement'],
                 'drift_alert': assessment['drift_alert'], 'attack_chain': assessment['attack_chain'],
                 'rule_hits': [{k: h[k] for k in ('rule', 'risk', 'response', 'explanation')} for h in assessment['rule_hits']],
                 'evaluator_note': assessment['evaluator']['note']})
    db.add(prediction)
    session.intent_prediction = assessment['intent_label']
    session.intent_categories = assessment['categories']
    session.intent_confidence = assessment['confidence']
    session.intent_risk = assessment['risk_level']
    session.session_risk = assessment['session_risk']
    session.purpose_alignment = assessment['purpose_alignment']
    session.intent_drift = assessment['intent_drift']
    session.last_updated = utcnow()
    return prediction


def intent_alert_payload(db, session, agent, event, assessment, settings):
    """HIGH-RISK INTENT PREDICTED: once per escalation level, ideally before the final harmful step.
    Returns the alert payload (or None); the gateway attaches it to the action's alert or raises it alone."""
    level = assessment['risk_level']
    if (RISK_ORDER.index(level) < 2 or assessment['confidence'] < config.INTENT_ALERT_CONFIDENCE
            or (session.alerted_level and RISK_ORDER.index(level) <= RISK_ORDER.index(session.alerted_level))):
        return None
    session.alerted_level = level
    next_step = assessment['predicted_next_actions'][0] if assessment['predicted_next_actions'] else None
    payload = {
        'kind': 'intent', 'title': 'HIGH-RISK INTENT PREDICTED', 'agent': agent.name, 'session_id': session.session_id,
        'declared_purpose': session.declared_purpose, 'tool': event.payload['action']['tool'],
        'resource': event.payload['action']['resource'],
        'observed_actions': [a.tool for a in db.scalars(select(SessionAction).where(
            SessionAction.session_id == session.session_id).order_by(SessionAction.sequence_index))],
        'predicted_intent': assessment['intent_label'], 'categories': assessment['categories'],
        'confidence': assessment['confidence'], 'intent_drift': assessment['intent_drift'],
        'possible_next_action': next_step, 'recommended_response': assessment['recommended_response'],
        'reasons': [assessment['predicted_intent']], 'risk_score': assessment['session_risk'],
        'response': agent.status, 'channels': settings['alert_channels'], 'simulation': True,
        'note': 'Prediction based on observable behavior; not a statement of the agent\'s hidden intent.',
        'risk_level': level,
    }
    append(db, {'kind': 'intent_alert', 'agent_id': agent.id, 'event_id': event.id, 'session_id': session.session_id,
                'predicted_intent': assessment['intent_label'], 'confidence': assessment['confidence'],
                'risk_level': level})
    return payload


def raise_alert(db, agent, event, payload) -> Alert:
    """A standalone early-warning alert for an action that was itself allowed."""
    alert = Alert(id=str(uuid4()), event_id=event.id, agent_id=agent.id,
                  severity='CRITICAL' if payload['risk_level'] == 'CRITICAL' else 'HIGH', payload=payload)
    db.add(alert)
    return alert


def evaluate_session(db, session) -> dict:
    """Re-evaluate a session on demand (no new action)."""
    context = build_session_context(db, session.session_id)
    assessment = assess(context)
    if context['recent_actions']:
        store_prediction(db, session, assessment, context['recent_actions'][-1]['index'])
    return assessment
