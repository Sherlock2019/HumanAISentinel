from fastapi import APIRouter, Depends
from sqlalchemy import select
from app.database.db import get_db
from app.models.records import Setting, Agent
from app.schemas.contracts import SettingsData
from app.sentinel.quarantine import transition
from app.sentinel.audit import append
from app.api.shared import require_admin
from app.config import AI_PROVIDER

router = APIRouter(prefix='/api/system', tags=['System'])

@router.get('/settings')
def settings(db=Depends(get_db)):
    return {**db.get(Setting, 'runtime').data, 'ai_provider': AI_PROVIDER, 'simulation_only': True}

@router.put('/settings', dependencies=[Depends(require_admin)])
def update(body: SettingsData, db=Depends(get_db)):
    record = db.get(Setting, 'runtime')
    record.data = {**record.data, **body.model_dump()}
    append(db, {'kind': 'settings_change', 'admin_action': 'UPDATE_SETTINGS', 'settings': body.model_dump()})
    db.commit()
    return record.data

@router.post('/emergency-stop', dependencies=[Depends(require_admin)])
def emergency(db=Depends(get_db)):
    record = db.get(Setting, 'runtime')
    record.data = {**record.data, 'emergency_stopped': True}
    for agent in db.scalars(select(Agent)):
        transition(db, agent, 'DISABLED', 'Global emergency stop')
    db.commit()
    return {'emergency_stopped': True, 'message': 'All synthetic sessions revoked. Future actions are blocked.'}

@router.post('/release-stop', dependencies=[Depends(require_admin)])
def release(db=Depends(get_db)):
    record = db.get(Setting, 'runtime')
    record.data = {**record.data, 'emergency_stopped': False}
    append(db, {'kind': 'admin_action', 'admin_action': 'RELEASE_GLOBAL_STOP', 'note': 'Agents remain disabled until individually restored'})
    db.commit()
    return {'emergency_stopped': False}
