from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from app.database.db import get_db
from app.models.records import Event, Action, Agent, Policy, Setting
from app.schemas.contracts import ActionRequest
from app.sentinel.gateway import intercept
from app.sentinel import policy_engine, capability_engine
from app.sentinel.audit import append
from app.simulator.demo_tools import execute
from app.api.shared import require_admin, event_dict

router = APIRouter(tags=['Runtime Gateway'])

@router.post('/api/actions/intercept')
def action_intercept(body: ActionRequest, x_agent_token: str = Header(default=''), db=Depends(get_db)):
    return intercept(db, body, x_agent_token)

@router.get('/api/events')
def events(agent_id: str | None = None, decision: str | None = None, severity: str | None = None, tool: str | None = None, limit: int = 200, db=Depends(get_db)):
    query = select(Event).order_by(Event.timestamp.desc())
    if agent_id:
        query = query.where(Event.agent_id == agent_id)
    if decision:
        query = query.where(Event.decision == decision)
    if severity:
        query = query.where(Event.severity == severity)
    items = [event_dict(e) for e in db.scalars(query.limit(min(max(limit, 1), 1000)))]
    return [e for e in items if not tool or tool.lower() in e['action']['tool'].lower()]

@router.get('/api/events/{id}')
def event(id: str, db=Depends(get_db)):
    item = db.get(Event, id)
    if not item:
        raise HTTPException(404, 'Event not found')
    return event_dict(item)

@router.post('/api/events/{id}/review', dependencies=[Depends(require_admin)])
def review(id: str, body: dict, db=Depends(get_db)):
    event = db.get(Event, id)
    if not event or event.review_status != 'PENDING':
        raise HTTPException(409, 'This action is not pending approval')
    choice = body.get('decision')
    if choice not in {'APPROVE', 'REJECT'}:
        raise HTTPException(422, 'Choose APPROVE or REJECT')
    agent, action = db.get(Agent, event.agent_id), db.get(Action, id)
    request = ActionRequest(**action.request)
    policy = policy_engine.evaluate(request, db.get(Policy, agent.id).data)
    capability = capability_engine.evaluate(db, agent.id, request.tool)
    if choice == 'APPROVE' and (agent.status not in {'RUNNING', 'REVIEW'} or db.get(Setting, 'runtime').data.get('emergency_stopped') or policy['decision'] == 'BLOCK' or capability['dangerous']):
        raise HTTPException(409, 'Current policy or agent state prevents execution. Approval cannot override a deny.')
    if choice == 'APPROVE':
        action.result = execute(request)
        action.executed = True
    event.review_status = 'APPROVED' if choice == 'APPROVE' else 'REJECTED'
    event.payload = {**event.payload, 'executed': action.executed, 'tool_result': action.result, 'admin_action': choice}
    if agent.status == 'REVIEW':
        agent.status = 'RUNNING'
    append(db, {'kind': 'human_review', 'event_id': id, 'agent_id': agent.id, 'admin_action': choice, 'executed': action.executed, 'tool_result': action.result})
    db.commit()
    return {**event_dict(event), 'executed': action.executed, 'tool_result': action.result}
