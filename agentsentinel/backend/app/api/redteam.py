from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from app.database.db import get_db
from app.models.records import Agent, BehaviorHistory, Setting, utcnow
from app.sentinel.quarantine import transition
from app.sentinel.gateway import intercept
from app.simulator.scenarios import SCENARIOS, request_for
from app.api.shared import require_admin
from app.sentinel.audit import append

router = APIRouter(prefix='/api/redteam', tags=['Simulation Lab'])

@router.get('/scenarios')
def scenarios():
    return SCENARIOS

@router.post('/prepare-demo', dependencies=[Depends(require_admin)])
def prepare_demo(db=Depends(get_db)):
    if db.get(Setting, 'runtime').data.get('emergency_stopped'):
        raise HTTPException(409, 'Release the global emergency stop in Settings before starting the demo')
    for id in ['support-agent', 'research-agent', 'coding-agent', 'finance-agent']:
        agent = db.get(Agent, id)
        transition(db, agent, 'RUNNING', 'Administrator started guided sandbox demo')
        agent.risk_score = 10
        agent.current_task = 'Ready for a guided demo task'
        agent.last_activity = utcnow()
    for history in db.scalars(select(BehaviorHistory).where(BehaviorHistory.agent_id.in_(['support-agent', 'research-agent', 'coding-agent', 'finance-agent']))):
        history.timestamp = utcnow()-timedelta(minutes=5)
    append(db, {'kind': 'demo_preparation', 'admin_action': 'RESET_SANDBOX_DEMO', 'note': 'Four demo agents restored; prior event and audit evidence retained'})
    db.commit()
    return {'ready': True}

@router.post('/run', dependencies=[Depends(require_admin)])
def run(body: dict, db=Depends(get_db)):
    scenario = next((s for s in SCENARIOS if s['id'] == body.get('scenario_id')), None)
    if not scenario:
        raise HTTPException(422, 'Unknown scenario')
    if db.get(Setting, 'runtime').data.get('emergency_stopped'):
        raise HTTPException(409, 'Release the global stop before running a simulation')
    # Explicit reset is a lab action; normal gateway requests never restore agents.
    if body.get('reset_agent', False):
        agent = db.get(Agent, scenario['agent_id'])
        transition(db, agent, 'RUNNING', 'Explicit sandbox scenario reset')
        for history in db.scalars(select(BehaviorHistory).where(BehaviorHistory.agent_id == agent.id)):
            history.timestamp = utcnow()-timedelta(minutes=5)
        append(db, {'kind': 'scenario_reset', 'agent_id': agent.id, 'admin_action': 'RESET_SANDBOX_BEHAVIOR_WINDOW'})
        db.commit()
    events = [intercept(db, request_for(scenario), None, trusted_demo=True) for _ in range(scenario.get('repeat', 1))]
    return {'scenario': scenario, 'events': events, 'result': events[-1], 'expected_met': events[-1]['decision'] == scenario['expected']}
