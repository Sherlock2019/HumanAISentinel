from time import perf_counter
from uuid import uuid4
import hashlib
import hmac
from fastapi import HTTPException
from app.models.records import Agent, Policy, Action, Event, BehaviorHistory, Setting, utcnow
from app.sentinel import policy_engine, behavior_engine, llm_safety_judge, capability_engine, risk_engine, decision_engine
from app.sentinel.quarantine import transition
from app.sentinel.alerts import notify
from app.sentinel.audit import append, redact
from app.simulator.demo_tools import execute

def intercept(db, request, token, trusted_demo=False):
    started = perf_counter()
    agent = db.get(Agent, request.agent_id)
    if not agent:
        raise HTTPException(404, 'Agent not found')
    if not trusted_demo:
        digest = hashlib.sha256((token or '').encode()).hexdigest()
        # A revoked credential can record its own denied attempt, but cannot
        # impersonate another agent or obtain permission to execute a tool.
        if not token or not agent.credential_hash or not hmac.compare_digest(digest, agent.credential_hash):
            raise HTTPException(401, 'Valid X-Agent-Token is required')
    settings = db.get(Setting, 'runtime').data
    policy = db.get(Policy, agent.id).data
    p = policy_engine.evaluate(request, policy)
    b = behavior_engine.evaluate(db, agent, request, policy)
    c = capability_engine.evaluate(db, agent.id, request.tool)
    judge = llm_safety_judge.evaluate(agent, request, policy, b['history'])
    risk = risk_engine.calculate(p, judge, b, c, request)
    decision = decision_engine.decide(p, judge, b, c, risk, settings)
    if policy.get('risk_sensitivity') == 'strict' and decision == 'ALLOW' and risk['score'] >= 30:
        decision = 'REVIEW'
    reasons = p['reasons'] + b['reasons']
    if c['dangerous']:
        reasons.append(c['reason'])
    if judge['recommended_decision'] != 'ALLOW':
        reasons.append(judge['summary'])
    unavailable = settings.get('emergency_stopped') or agent.status in {'PAUSED', 'QUARANTINED', 'DISABLED'}
    if unavailable:
        decision = 'BLOCK'
        reasons.insert(0, f'Agent session is {agent.status.lower()}; execution is locked.')
        risk['score'], risk['severity'] = max(risk['score'], 80), 'CRITICAL'
    should_quarantine = decision == 'BLOCK' and settings['auto_quarantine'] and (p['critical'] or c['dangerous'] or judge['injection_risk'] >= 4 or b['blocked_recent'] + 1 >= settings['blocked_retry_threshold'] or b['score'] >= 80)
    if should_quarantine and agent.status not in {'QUARANTINED', 'DISABLED'}:
        transition(db, agent, 'QUARANTINED', 'Automatic containment after a critical violation or repeated blocked attempts')
    if decision == 'REVIEW' and agent.status == 'RUNNING':
        agent.status = 'REVIEW'
    event_id = str(uuid4())
    action = Action(id=event_id, agent_id=agent.id, request=redact(request.model_dump()))
    # Execution is deliberately after all safety checks and final state checks.
    if decision == 'ALLOW':
        action.result = execute(request)
        action.executed = True
    agent.current_task = request.task
    agent.risk_score = risk['score']
    agent.last_activity = utcnow()
    payload = {'agent_name': agent.name, 'agent_purpose': agent.purpose, 'action': redact(request.model_dump()), 'policy_result': p, 'llm_result': judge, 'behavior': b, 'capability': c, 'risk': risk, 'reasons': reasons or ['Tool, resource and intent fit the registered task.'], 'quarantine_state': agent.status, 'executed': action.executed, 'tool_result': action.result, 'timing_ms': round((perf_counter()-started)*1000, 2), 'request_id': event_id}
    event = Event(id=event_id, agent_id=agent.id, decision=decision, severity=risk['severity'], risk_score=risk['score'], payload=payload, review_status='PENDING' if decision == 'REVIEW' else None)
    db.add_all([action, event, BehaviorHistory(id=event_id, agent_id=agent.id, tool=request.tool, resource=request.resource, decision=decision, cost=request.simulated_cost)])
    alert_generated = decision in {'BLOCK', 'REVIEW'}
    if alert_generated:
        notify(db, agent, event, settings)
    append(db, {'kind': 'action_decision', 'event_id': event.id, 'agent_id': agent.id, 'decision': decision, 'final_risk': risk['score'], 'alert_generated': alert_generated, **payload})
    db.commit()
    return {'id': event.id, 'timestamp': event.timestamp.isoformat(), 'agent_id': agent.id, 'decision': decision, 'severity': risk['severity'], 'risk_score': risk['score'], 'quarantine': agent.status == 'QUARANTINED', 'alert': alert_generated, 'review_status': event.review_status, **payload}
