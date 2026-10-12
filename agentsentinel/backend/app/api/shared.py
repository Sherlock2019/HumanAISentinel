from fastapi import Header, HTTPException
from app.config import ADMIN_TOKEN

def require_admin(x_admin_token: str = Header(default='')):
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(401, 'Administrator token required')

def event_dict(event):
    return {'id': event.id, 'timestamp': event.timestamp.isoformat(), 'agent_id': event.agent_id, 'decision': event.decision, 'severity': event.severity, 'risk_score': event.risk_score, 'review_status': event.review_status, **event.payload}
