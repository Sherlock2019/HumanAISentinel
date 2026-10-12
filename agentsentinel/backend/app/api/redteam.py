from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from app.database.db import get_db
from app.models.records import Agent, BehaviorHistory, Setting, utcnow
from app.sentinel.quarantine import transition
from app.sentinel.gateway import intercept
from app.simulator.scenarios import SCENARIOS, request_for
from app.simulator.intent_scenarios import INTENT_SCENARIOS
from app.schemas.contracts import ActionRequest
from app.sentinel import intent_service
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


@router.get('/intent-scenarios')
def intent_scenarios():
    return INTENT_SCENARIOS


@router.post('/intent-step', dependencies=[Depends(require_admin)])
def intent_step(body: dict, db=Depends(get_db)):
    """Run ONE action of an intent chain through the real gateway and return the updated prediction.
    Step 0 resets the target agent and opens a fresh session."""
    scenario = next((s for s in INTENT_SCENARIOS if s['id'] == body.get('scenario_id')), None)
    if not scenario:
        raise HTTPException(422, 'Unknown intent scenario')
    if db.get(Setting, 'runtime').data.get('emergency_stopped'):
        raise HTTPException(409, 'Release the global stop before running a simulation')
    index = int(body.get('step', 0))
    if not 0 <= index < len(scenario['steps']):
        raise HTTPException(422, 'Step is out of range')
    agent = db.get(Agent, scenario['agent_id'])
    if index == 0:
        transition(db, agent, 'RUNNING', f'Intent chain “{scenario["title"]}” started in the sandbox')
        for history in db.scalars(select(BehaviorHistory).where(BehaviorHistory.agent_id == agent.id)):
            history.timestamp = utcnow()-timedelta(minutes=5)
        session_id = intent_service.create_session(db, agent, scenario['objective']).session_id
        db.commit()
    else:
        session_id = body.get('session_id')
        if not session_id:
            raise HTTPException(422, 'session_id is required after the first step')
    step = scenario['steps'][index]
    request = ActionRequest(agent_id=agent.id, task=step['task'], tool=step['tool'], resource=step['resource'],
                            operation=step['operation'], arguments=step['arguments'], session_id=session_id,
                            context={'user_objective': scenario['objective']})
    event = intercept(db, request, None, trusted_demo=True)
    return {'scenario_id': scenario['id'], 'session_id': session_id, 'step': index, 'total': len(scenario['steps']),
            'done': index == len(scenario['steps']) - 1, 'note': step['note'], 'event': event, 'intent': event['intent']}
