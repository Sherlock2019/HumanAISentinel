import pytest
from app.simulator.demo_tools import EXECUTIONS
from app.providers.mock import MockProvider
from app.schemas.contracts import JudgeResult
from app.sentinel import llm_safety_judge

def run(client, admin, id, reset=False):
    response = client.post('/api/redteam/run', json={'scenario_id': id, 'reset_agent': reset}, headers=admin)
    assert response.status_code == 200, response.text
    return response.json()

def test_allowed_tool_executes(client, admin):
    r = run(client, admin, 'safe')['result']
    assert r['decision'] == 'ALLOW' and r['executed']
    assert len(EXECUTIONS) == 1

def test_denied_tool_never_executes(client, admin):
    r = run(client, admin, 'unauthorized')['result']
    assert r['decision'] == 'BLOCK' and not r['executed']
    assert not EXECUTIONS

def test_approval_holds_then_executes_once(client, admin):
    event = run(client, admin, 'payment')['result']
    assert event['decision'] == 'REVIEW' and not EXECUTIONS
    r = client.post(f'/api/events/{event["id"]}/review', json={'decision': 'APPROVE'}, headers=admin)
    assert r.status_code == 200 and r.json()['executed']
    assert len(EXECUTIONS) == 1
    assert client.post(f'/api/events/{event["id"]}/review', json={'decision': 'APPROVE'}, headers=admin).status_code == 409

@pytest.mark.parametrize('scenario', ['secret', 'iam', 'injection', 'exfiltration', 'chain'])
def test_critical_scenarios_quarantine(client, admin, scenario):
    r = run(client, admin, scenario)['result']
    assert r['decision'] == 'BLOCK' and r['quarantine_state'] == 'QUARANTINED'
    assert r['risk_score'] >= 80 and not EXECUTIONS

def test_quarantined_agent_cannot_act(client, admin):
    run(client, admin, 'secret')
    body = {'agent_id': 'coding-agent', 'task': 'Review code', 'tool': 'read_repo', 'resource': 'demo_repo'}
    r = client.post('/api/actions/intercept', json=body, headers={'X-Agent-Token': 'demo-coding-agent-token'})
    assert r.status_code == 200 and r.json()['decision'] == 'BLOCK' and not EXECUTIONS

def test_three_blocked_actions_quarantine(client, admin):
    r = run(client, admin, 'retry')
    assert [e['decision'] for e in r['events']] == ['BLOCK']*3
    assert r['events'][0]['quarantine_state'] != 'QUARANTINED'
    assert r['events'][1]['quarantine_state'] != 'QUARANTINED'
    assert r['events'][2]['quarantine_state'] == 'QUARANTINED'

def test_runaway_loop_contained(client, admin):
    r = run(client, admin, 'loop')
    assert r['result']['decision'] == 'BLOCK'
    assert r['result']['quarantine_state'] == 'QUARANTINED'

def test_global_kill_revokes_sessions(client, admin):
    assert client.post('/api/system/emergency-stop', headers=admin).status_code == 200
    assert all(a['status'] == 'DISABLED' for a in client.get('/api/agents').json())
    body = {'agent_id': 'support-agent', 'task': 'Support search', 'tool': 'search_kb', 'resource': 'knowledge_base'}
    r = client.post('/api/actions/intercept', json=body, headers={'X-Agent-Token': 'demo-support-agent-token'})
    assert r.json()['decision'] == 'BLOCK' and not EXECUTIONS
    assert client.post('/api/agents/support-agent/resume', headers=admin).status_code == 409

def test_deny_overrides_safe_model_advice(client, admin, monkeypatch):
    monkeypatch.setattr(MockProvider, 'evaluate', lambda self, p: JudgeResult(intent_alignment=5, authorization_risk=1, data_risk=1, injection_risk=1, necessity=5, recommended_decision='ALLOW', summary='Safe'))
    assert run(client, admin, 'secret')['result']['decision'] == 'BLOCK'
    assert not EXECUTIONS

def test_explicit_deny_wins_conflicting_policy(client, admin):
    policy = client.get('/api/policies').json()[1]['policy']
    policy['allow'].append('execute_shell')
    policy['require_approval'].append('execute_shell')
    client.put('/api/policies/research-agent', json=policy, headers=admin)
    assert run(client, admin, 'unauthorized')['result']['decision'] == 'BLOCK'

def test_capability_graph_transitive_path(client):
    paths = client.get('/api/capabilities/support-agent').json()['dangerous_paths']
    assert ['support-agent', 'workflow_api', 'admin_endpoint', 'customer_database_write'] in paths

def test_audit_and_admin_alert_created(client, admin):
    r = run(client, admin, 'secret')['result']
    records = client.get('/api/audit').json()
    assert any(a.get('event_id') == r['id'] and a['kind'] == 'action_decision' for a in records)
    assert any(a['event_id'] == r['id'] for a in client.get('/api/alerts').json())
    decision_record = next(a for a in records if a.get('event_id') == r['id'] and a['kind'] == 'action_decision')
    assert decision_record['llm_result']['authorization_risk'] == 5
    assert client.get('/api/audit/verify').json()['valid']
    assert 'evidence_json' in client.get('/api/audit?format=csv').text

def test_evaluator_failure_fails_closed(client, admin, monkeypatch):
    monkeypatch.setattr(llm_safety_judge.provider, 'evaluate', lambda p: (_ for _ in ()).throw(RuntimeError('unavailable')))
    r = run(client, admin, 'safe')['result']
    assert r['decision'] == 'REVIEW' and not r['executed'] and not EXECUTIONS

def test_admin_auth_and_agent_auth(client):
    assert client.post('/api/system/emergency-stop').status_code == 401
    assert client.post('/api/actions/intercept', json={'agent_id': 'support-agent', 'task': 'Search knowledge', 'tool': 'search_kb', 'resource': 'knowledge_base'}).status_code == 401

def test_restored_agent_has_new_token(client, admin):
    run(client, admin, 'secret')
    restored = client.post('/api/agents/coding-agent/resume', headers=admin).json()
    assert restored['status'] == 'RUNNING' and restored['token'] != 'demo-coding-agent-token'
    body = {'agent_id': 'coding-agent', 'task': 'Review source code', 'tool': 'read_repo', 'resource': 'demo_repo'}
    assert client.post('/api/actions/intercept', json=body, headers={'X-Agent-Token': 'demo-coding-agent-token'}).status_code == 401
    assert client.post('/api/actions/intercept', json=body, headers={'X-Agent-Token': restored['token']}).json()['decision'] == 'ALLOW'

def test_random_token_cannot_impersonate_quarantined_agent(client, admin):
    run(client, admin, 'secret')
    body = {'agent_id': 'coding-agent', 'task': 'Review source code', 'tool': 'read_repo', 'resource': 'demo_repo'}
    assert client.post('/api/actions/intercept', json=body, headers={'X-Agent-Token': 'random-token'}).status_code == 401

def test_demo_cannot_bypass_global_stop(client, admin):
    client.post('/api/system/emergency-stop', headers=admin)
    assert client.post('/api/redteam/prepare-demo', headers=admin).status_code == 409

def test_approval_rechecks_updated_policy(client, admin):
    e = run(client, admin, 'payment')['result']
    p = next(p for p in client.get('/api/policies').json() if p['agent_id'] == 'finance-agent')['policy']
    p['deny'].append('create_payment_request')
    client.put('/api/policies/finance-agent', json=p, headers=admin)
    assert client.post(f'/api/events/{e["id"]}/review', json={'decision': 'APPROVE'}, headers=admin).status_code == 409
    assert not EXECUTIONS

def test_quarantine_cancels_pending_reviews(client, admin):
    e = run(client, admin, 'payment')['result']
    client.post('/api/agents/finance-agent/quarantine', headers=admin)
    assert client.get('/api/events/'+e['id']).json()['review_status'] == 'CANCELLED'

def test_invalid_policy_rejected(client, admin):
    assert client.put('/api/policies/support-agent', json={'yaml': 'allow: [broken'}, headers=admin).status_code == 422

def test_read_tool_cannot_be_used_to_write(client):
    body = {'agent_id': 'support-agent', 'task': 'Search support documents', 'tool': 'search_kb', 'resource': 'knowledge_base', 'operation': 'WRITE'}
    r = client.post('/api/actions/intercept', json=body, headers={'X-Agent-Token': 'demo-support-agent-token'})
    assert r.json()['decision'] == 'BLOCK' and not EXECUTIONS
    assert not r.json()['policy_result']['operation_allowed']

def test_register_agent_and_enforce_its_scope(client, admin):
    response = client.post('/api/agents', headers=admin, json={'name': 'ReviewDemoAgent', 'purpose': 'Read synthetic public documents for internal summaries.', 'policy': {'allow': ['read_public_doc'], 'resources_allow': ['public_docs']}})
    assert response.status_code == 200
    agent = response.json()
    body = {'agent_id': agent['id'], 'task': 'Read a synthetic public document', 'tool': 'read_public_doc', 'resource': 'public_docs'}
    assert client.post('/api/actions/intercept', json=body, headers={'X-Agent-Token': agent['token']}).json()['decision'] == 'ALLOW'
    body['resource'] = 'private_docs'
    assert client.post('/api/actions/intercept', json=body, headers={'X-Agent-Token': agent['token']}).json()['decision'] == 'BLOCK'

def test_pause_blocks_and_resume_reopens_session(client, admin):
    client.post('/api/agents/support-agent/pause', headers=admin)
    body = {'agent_id': 'support-agent', 'task': 'Search support documents', 'tool': 'search_kb', 'resource': 'knowledge_base'}
    assert client.post('/api/actions/intercept', json=body, headers={'X-Agent-Token': 'demo-support-agent-token'}).json()['decision'] == 'BLOCK'
    assert not EXECUTIONS
    resumed = client.post('/api/agents/support-agent/resume', headers=admin).json()
    assert client.post('/api/actions/intercept', json=body, headers={'X-Agent-Token': resumed['token']}).json()['decision'] == 'ALLOW'

def test_redaction_of_credentials(client):
    body = {'agent_id': 'support-agent', 'task': 'Support search', 'tool': 'search_kb', 'resource': 'knowledge_base', 'arguments': {'password': 'SYNTHETIC_PASSWORD'}}
    r = client.post('/api/actions/intercept', json=body, headers={'X-Agent-Token': 'demo-support-agent-token'})
    assert r.json()['action']['arguments']['password'] == '[REDACTED]'
    assert 'SYNTHETIC_PASSWORD' not in client.get('/api/audit').text
