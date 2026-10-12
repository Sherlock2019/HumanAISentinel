from uuid import uuid4
import hashlib
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from app.database.db import get_db
from app.models.records import Agent, AgentSession, Policy, Event, BehaviorHistory, Setting, utcnow
from app.schemas.contracts import AgentCreate
from app.sentinel.quarantine import transition
from app.api.shared import require_admin
from datetime import timedelta

router = APIRouter(prefix='/api/agents', tags=['Agents'])

def intent_summary(db, a):
    s = db.scalar(select(AgentSession).where(AgentSession.agent_id == a.id).order_by(AgentSession.last_updated.desc()).limit(1))
    if s is None:
        return None
    return {'session_id': s.session_id, 'predicted_intent': s.intent_prediction, 'categories': s.intent_categories,
            'confidence': s.intent_confidence, 'risk': s.intent_risk, 'drift': s.intent_drift,
            'session_risk': s.session_risk, 'session_status': s.status}

def serialize(db, a, credentials=False):
    return {'id': a.id, 'name': a.name, 'purpose': a.purpose, 'owner': a.owner, 'environment': a.environment, 'status': a.status, 'risk_score': a.risk_score, 'current_task': a.current_task, 'last_activity': a.last_activity.isoformat(), 'blocked': db.scalar(select(func.count()).select_from(Event).where(Event.agent_id == a.id, Event.decision == 'BLOCK')), 'actions_per_minute': db.scalar(select(func.count()).select_from(BehaviorHistory).where(BehaviorHistory.agent_id == a.id, BehaviorHistory.timestamp >= utcnow()-timedelta(seconds=60))), 'policy': db.get(Policy, a.id).data, 'intent': intent_summary(db, a), **({'token': a.token} if credentials else {})}

@router.get('')
def list_agents(db=Depends(get_db)):
    return [serialize(db, a) for a in db.scalars(select(Agent))]

@router.post('', dependencies=[Depends(require_admin)])
def create_agent(body: AgentCreate, db=Depends(get_db)):
    id = str(uuid4())
    token = f'demo-{uuid4()}'
    agent = Agent(id=id, name=body.name, purpose=body.purpose, owner=body.owner, environment=body.environment, token=token, credential_hash=hashlib.sha256(token.encode()).hexdigest())
    db.add_all([agent, Policy(agent_id=id, data=body.policy.model_dump())])
    db.flush()
    transition(db, agent, 'RUNNING', 'Agent registered by administrator')
    db.commit()
    return serialize(db, agent, True)

@router.get('/{id}')
def get_agent(id: str, db=Depends(get_db)):
    agent = db.get(Agent, id)
    if not agent:
        raise HTTPException(404, 'Agent not found')
    return serialize(db, agent)

@router.post('/{id}/{operation}', dependencies=[Depends(require_admin)])
def agent_control(id: str, operation: str, db=Depends(get_db)):
    states = {'pause': 'PAUSED', 'resume': 'RUNNING', 'quarantine': 'QUARANTINED', 'kill': 'DISABLED'}
    if operation not in states:
        raise HTTPException(404, 'Unknown agent operation')
    agent = db.get(Agent, id)
    if not agent:
        raise HTTPException(404, 'Agent not found')
    if operation == 'resume' and db.get(Setting, 'runtime').data.get('emergency_stopped'):
        raise HTTPException(409, 'Release the global emergency stop before restoring an agent')
    transition(db, agent, states[operation], f'Administrator selected {operation}')
    db.commit()
    return serialize(db, agent, True)
