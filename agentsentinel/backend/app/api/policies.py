import yaml
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from app.database.db import get_db
from app.models.records import Policy
from app.schemas.contracts import PolicyData
from app.sentinel.audit import append
from app.api.shared import require_admin

router = APIRouter(prefix='/api/policies', tags=['Policies'])

@router.get('')
def policies(db=Depends(get_db)):
    return [{'agent_id': p.agent_id, 'version': p.version, 'policy': p.data, 'yaml': yaml.safe_dump(p.data, sort_keys=False)} for p in db.scalars(select(Policy))]

@router.put('/{agent_id}', dependencies=[Depends(require_admin)])
def update_policy(agent_id: str, body: dict, db=Depends(get_db)):
    policy = db.get(Policy, agent_id)
    if not policy:
        raise HTTPException(404, 'Policy not found')
    try:
        data = yaml.safe_load(body['yaml']) if 'yaml' in body else body.get('policy', body)
        validated = PolicyData.model_validate(data)
    except Exception as error:
        raise HTTPException(422, f'Invalid policy: {str(error)[:300]}')
    policy.data = validated.model_dump()
    policy.version += 1
    append(db, {'kind': 'policy_change', 'agent_id': agent_id, 'admin_action': 'UPDATE_POLICY', 'version': policy.version, 'policy': policy.data})
    db.commit()
    return {'agent_id': agent_id, 'version': policy.version, 'policy': policy.data, 'yaml': yaml.safe_dump(policy.data, sort_keys=False)}
