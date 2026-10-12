from uuid import uuid4
import hashlib
from sqlalchemy import select
from app.models.records import AgentState, Event
from app.sentinel.audit import append

def transition(db, agent, state, reason):
    agent.status = state
    if state in {'QUARANTINED', 'DISABLED', 'PAUSED'}:
        agent.token = None
        for event in db.scalars(select(Event).where(Event.agent_id == agent.id, Event.review_status == 'PENDING')):
            event.review_status = 'CANCELLED'
    elif state == 'RUNNING':
        agent.token = f'demo-{uuid4()}'
        agent.credential_hash = hashlib.sha256(agent.token.encode()).hexdigest()
    db.add(AgentState(id=str(uuid4()), agent_id=agent.id, state=state, reason=reason))
    append(db, {'kind': 'agent_state', 'agent_id': agent.id, 'state': state, 'admin_action': reason})
