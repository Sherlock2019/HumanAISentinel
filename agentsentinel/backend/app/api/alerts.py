from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from app.database.db import get_db
from app.models.records import Alert
from app.sentinel.audit import append
from app.api.shared import require_admin

router = APIRouter(prefix='/api/alerts', tags=['Alerts'])

@router.get('')
def alerts(db=Depends(get_db)):
    return [{'id': a.id, 'event_id': a.event_id, 'agent_id': a.agent_id, 'severity': a.severity, 'timestamp': a.timestamp.isoformat(), 'acknowledged': a.acknowledged, **a.payload} for a in db.scalars(select(Alert).order_by(Alert.timestamp.desc()).limit(200))]

@router.post('/{id}/acknowledge', dependencies=[Depends(require_admin)])
def acknowledge(id: str, db=Depends(get_db)):
    alert = db.get(Alert, id)
    if not alert:
        raise HTTPException(404, 'Alert not found')
    alert.acknowledged = True
    append(db, {'kind': 'admin_action', 'alert_id': id, 'admin_action': 'ACKNOWLEDGE'})
    db.commit()
    return {'acknowledged': True}
