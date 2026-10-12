from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.api.shared import require_admin
from app.database.db import get_db
from app.models.records import Agent, AgentSession, AgentState, Event, IntentPrediction, SessionAction
from app.schemas.contracts import SessionCreate
from app.sentinel import intent_service
from app.sentinel.intent_engine import assess
from app.sentinel.intent_rules import classify, describe
from app.sentinel.session_context import action_record, build_session_context, summarize

router = APIRouter(tags=['Intent Sentinel'])


def session_dict(db, s: AgentSession) -> dict:
    agent = db.get(Agent, s.agent_id)
    count = len(list(db.scalars(select(SessionAction.action_id).where(SessionAction.session_id == s.session_id))))
    return {'session_id': s.session_id, 'agent_id': s.agent_id, 'agent_name': agent.name if agent else s.agent_id,
            'agent_status': agent.status if agent else None, 'declared_purpose': s.declared_purpose,
            'user_objective': s.user_objective, 'start_time': s.start_time.isoformat(), 'status': s.status,
            'intent_prediction': s.intent_prediction, 'intent_categories': s.intent_categories,
            'intent_confidence': s.intent_confidence, 'intent_risk': s.intent_risk, 'session_risk': s.session_risk,
            'purpose_alignment': s.purpose_alignment, 'intent_drift': s.intent_drift,
            'last_updated': s.last_updated.isoformat(), 'actions': count}


def get_session(db, session_id) -> AgentSession:
    session = db.get(AgentSession, session_id)
    if not session:
        raise HTTPException(404, 'Session not found')
    return session


def prediction_dict(p: IntentPrediction) -> dict:
    return {'prediction_id': p.prediction_id, 'session_id': p.session_id, 'timestamp': p.timestamp.isoformat(),
            'sequence_index': p.sequence_index, 'predicted_intent': p.predicted_intent,
            'intent_label': p.details.get('intent_label', p.predicted_intent), 'categories': p.intent_category,
            'confidence': p.confidence, 'risk_level': p.risk_level, 'session_risk': p.session_risk,
            'purpose_alignment': p.purpose_alignment, 'intent_drift': p.intent_drift,
            'evidence_actions': p.evidence_actions, 'reasoning_summary': p.reasoning_summary,
            'predicted_next_actions': p.predicted_next_actions, 'recommended_response': p.recommended_response,
            'enforcement': p.details.get('enforcement'), 'drift_alert': p.details.get('drift_alert', ''),
            'attack_chain': p.details.get('attack_chain'), 'rule_hits': p.details.get('rule_hits', []),
            'evaluator_note': p.details.get('evaluator_note', ''), 'model_provider': p.model_provider,
            'model_version': p.model_version}


@router.get('/api/sessions')
def sessions(agent_id: str | None = None, limit: int = 50, db=Depends(get_db)):
    query = select(AgentSession).order_by(AgentSession.last_updated.desc())
    if agent_id:
        query = query.where(AgentSession.agent_id == agent_id)
    return [session_dict(db, s) for s in db.scalars(query.limit(min(max(limit, 1), 500)))]


@router.post('/api/sessions', dependencies=[Depends(require_admin)])
def create(body: SessionCreate, db=Depends(get_db)):
    agent = db.get(Agent, body.agent_id)
    if not agent:
        raise HTTPException(404, 'Agent not found')
    session = intent_service.create_session(db, agent, body.user_objective)
    db.commit()
    return session_dict(db, session)


@router.get('/api/sessions/{session_id}')
def session(session_id: str, db=Depends(get_db)):
    s = get_session(db, session_id)
    latest = db.scalar(select(IntentPrediction).where(IntentPrediction.session_id == session_id)
                       .order_by(IntentPrediction.timestamp.desc(), IntentPrediction.sequence_index.desc()).limit(1))
    last_action = db.scalar(select(SessionAction).where(SessionAction.session_id == session_id)
                            .order_by(SessionAction.sequence_index.desc()).limit(1))
    event = db.get(Event, last_action.action_id) if last_action else None
    return {**session_dict(db, s), 'latest_prediction': prediction_dict(latest) if latest else None,
            'assessment': event.payload.get('intent') if event else None,
            'observed_actions': [a.tool for a in db.scalars(select(SessionAction).where(
                SessionAction.session_id == session_id).order_by(SessionAction.sequence_index))]}


@router.get('/api/sessions/{session_id}/timeline')
def timeline(session_id: str, db=Depends(get_db)):
    """Every action with its decision, the prediction after it, and containment events, in order."""
    s = get_session(db, session_id)
    actions = list(db.scalars(select(SessionAction).where(SessionAction.session_id == session_id)
                              .order_by(SessionAction.sequence_index)))
    predictions = {p.sequence_index: p for p in db.scalars(select(IntentPrediction).where(
        IntentPrediction.session_id == session_id).order_by(IntentPrediction.timestamp))}
    items = []
    for a in actions:
        p = predictions.get(a.sequence_index)
        enforcement = p.details.get('enforcement') if p else 'ALLOW'
        status = ('BLOCKED' if a.final_decision == 'BLOCK' else 'REVIEW' if a.final_decision == 'REVIEW' else
                  'HIGH RISK' if a.session_risk >= 55 else 'WATCH' if enforcement == 'WATCH' else 'ALLOWED')
        record = action_record(a.tool, a.resource, a.operation, a.final_decision, a.sequence_index)
        items.append({'type': 'action', 'timestamp': a.timestamp.isoformat(), 'sequence_index': a.sequence_index,
                      'tool': a.tool, 'resource': a.resource, 'operation': a.operation, 'class': record['class'],
                      'description': describe(record), 'decision': a.final_decision, 'policy_decision': a.policy_decision,
                      'status': status, 'risk_score': a.risk_score, 'session_risk': a.session_risk, 'event_id': a.action_id,
                      'prediction': prediction_dict(p) if p else None})
    end = actions[-1].timestamp if actions else s.last_updated
    for state in db.scalars(select(AgentState).where(AgentState.agent_id == s.agent_id, AgentState.timestamp >= s.start_time,
                                                     AgentState.timestamp <= end).order_by(AgentState.timestamp)):
        if state.state in {'QUARANTINED', 'PAUSED', 'DISABLED'}:
            # A containment is written a moment before the event that triggered it; show it right after that action.
            trigger = next((a for a in actions if a.timestamp >= state.timestamp), None)
            items.append({'type': 'state', 'timestamp': state.timestamp.isoformat(), 'state': state.state,
                          'reason': state.reason, 'after': trigger.sequence_index if trigger else None})
    items.sort(key=lambda i: (i['sequence_index'], 0) if i['type'] == 'action' else
               ((i['after'] if i['after'] is not None else 10**6), 1))
    return {'session': session_dict(db, s), 'items': items}


@router.get('/api/sessions/{session_id}/intent')
def intent(session_id: str, db=Depends(get_db)):
    get_session(db, session_id)
    history = [prediction_dict(p) for p in db.scalars(select(IntentPrediction).where(
        IntentPrediction.session_id == session_id).order_by(IntentPrediction.sequence_index, IntentPrediction.timestamp))]
    return {'latest': history[-1] if history else None, 'history': history}


@router.post('/api/sessions/{session_id}/evaluate-intent', dependencies=[Depends(require_admin)])
def evaluate_intent(session_id: str, db=Depends(get_db)):
    s = get_session(db, session_id)
    assessment = intent_service.evaluate_session(db, s)
    db.commit()
    return intent_service.compact(assessment) | {'risk_trend': assessment['risk_trend'],
                                                 'context': {k: v for k, v in build_session_context(db, session_id).items()
                                                             if k not in {'recent_actions', 'history'}}}


@router.get('/api/sessions/{session_id}/risk-trend')
def risk_trend(session_id: str, db=Depends(get_db)):
    get_session(db, session_id)
    predictions = {p.sequence_index: p for p in db.scalars(select(IntentPrediction).where(
        IntentPrediction.session_id == session_id).order_by(IntentPrediction.timestamp))}
    points = []
    for a in db.scalars(select(SessionAction).where(SessionAction.session_id == session_id).order_by(SessionAction.sequence_index)):
        p = predictions.get(a.sequence_index)
        points.append({'step': a.sequence_index, 'tool': a.tool, 'action_risk': a.risk_score, 'session_risk': a.session_risk,
                       'intent_drift': p.intent_drift if p else None, 'purpose_alignment': p.purpose_alignment if p else None,
                       'confidence': p.confidence if p else None, 'decision': a.final_decision,
                       'intent': p.details.get('intent_label') if p else None})
    return {'session_id': session_id, 'points': points,
            'note': 'Session risk accumulates across actions and decays when the agent returns to normal work.'}


COMPARISON = {
    'normal': ('Answer support questions and create support tickets.', {'search_kb', 'get_ticket', 'create_ticket'},
               [('search_kb', 'knowledge_base', 'ALLOW'), ('get_ticket', 'support_db', 'ALLOW'), ('create_ticket', 'support_db', 'ALLOW')]),
    'suspicious': ('Read code, run tests and suggest patches for source code review.',
                   {'read_repo', 'run_tests', 'list_files', 'read_config', 'read_env'},
                   [('list_files', 'demo_repo', 'ALLOW'), ('read_env', 'environment', 'ALLOW'),
                    ('read_secret', 'AWS_PRODUCTION_TOKEN', 'BLOCK'), ('external_upload', 'demo_repo', 'BLOCK')]),
}


@router.get('/api/intent/comparison')
def comparison():
    """Normal versus suspicious session, both scored by the real engine (nothing is hard-coded)."""
    out = {}
    for key, (purpose, allowed, steps) in COMPARISON.items():
        actions = [action_record(tool, resource, decision=decision, index=i, current=(i == len(steps)))
                   for i, (tool, resource, decision) in enumerate(steps, start=1)]
        a = assess(summarize(purpose, '', actions, allowed))
        out[key] = {'declared_purpose': purpose, 'sequence': [s[0] for s in steps],
                    'classes': [classify(s[0], s[1]) for s in steps], **intent_service.compact(a)}
    return out
