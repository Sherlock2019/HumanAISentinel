import pytest
from app.simulator.demo_tools import EXECUTIONS

def start(client, admin, example='injection', **kwargs):
    response = client.post('/api/commit-demo/runs', headers=admin, json={'example_id': example, 'reset_agent': True, **kwargs})
    assert response.status_code == 200, response.text
    return response.json()

def finish(client, admin, run):
    for step in range(run['cursor'], 3):
        response = client.post(f'/api/commit-demo/runs/{run["id"]}/advance', headers=admin, json={'expected_step': step})
        assert response.status_code == 200, response.text
        run = response.json()
    return run

@pytest.mark.parametrize('example,decisions,executed', [('safe', ['ALLOW']*3, 3), ('approval', ['ALLOW', 'ALLOW', 'REVIEW'], 2), ('injection', ['ALLOW', 'BLOCK', 'BLOCK'], 1)])
def test_mock_commit_calls_real_gateway(client, admin, example, decisions, executed):
    run = finish(client, admin, start(client, admin, example))
    assert [event['decision'] for event in run['events']] == decisions
    assert run['test_status'] == 'PASS'
    assert run['summary']['executed'] == len(EXECUTIONS) == executed
    assert client.get(f'/api/commit-demo/runs/{run["id"]}').json()['events'] == run['events']
    assert client.get('/api/commit-demo/runs').json()[0]['id'] == run['id']
    assert all(event['action']['context']['commit_demo_run_id'] == run['id'] for event in run['events'])
    assert client.get('/api/audit/verify').json()['valid']
    if example == 'injection':
        assert run['contained'] and run['events'][1]['risk_score'] == 98
        assert run['events'][2]['quarantine_state'] == 'QUARANTINED'
        assert 'untrusted_diff' in run['events'][1]['action']['context']
        assert len(client.get('/api/alerts').json()) == 2

def test_commit_approval_revalidates_and_updates_report(client, admin):
    run = finish(client, admin, start(client, admin, 'approval'))
    assert run['workflow_status'] == 'WAITING_APPROVAL'
    event = run['events'][-1]
    response = client.post(f'/api/events/{event["id"]}/review', headers=admin, json={'decision': 'APPROVE'})
    assert response.status_code == 200
    updated = client.get(f'/api/commit-demo/runs/{run["id"]}').json()
    assert updated['workflow_status'] == 'COMPLETED'
    assert updated['test_status'] == 'PASS' and updated['summary']['executed'] == 3
    assert client.post(f'/api/events/{event["id"]}/review', headers=admin, json={'decision': 'APPROVE'}).status_code == 409

def test_commit_step_retry_does_not_duplicate_execution(client, admin):
    run = start(client, admin, 'safe')
    path = f'/api/commit-demo/runs/{run["id"]}/advance'
    assert client.post(path, headers=admin, json={'expected_step': 2}).status_code == 409
    first = client.post(path, headers=admin, json={'expected_step': 0}).json()
    retry = client.post(path, headers=admin, json={'expected_step': 0}).json()
    assert first['events'] == retry['events'] and len(EXECUTIONS) == 1

def test_commit_start_requires_confirmation_and_admin(client, admin):
    body = {'example_id': 'safe', 'reset_agent': True}
    assert client.post('/api/commit-demo/runs', json=body).status_code == 401
    assert client.post('/api/commit-demo/runs', headers=admin, json={'example_id': 'safe'}).status_code == 422
    run = start(client, admin)
    assert client.post(f'/api/commit-demo/runs/{run["id"]}/advance', json={'expected_step': 0}).status_code == 401

@pytest.mark.parametrize('url', ['http://github.com/owner/repo/commit/abcdef1', 'https://attacker.demo/owner/repo/commit/abcdef1', 'https://github.com@attacker.demo/owner/repo/commit/abcdef1', 'https://github.com/owner/repo/commit/not-a-sha', 'https://github.com/owner/repo/commit/abcdef1?token=bad', 'https://github.com/owner/repo/pull/1', 'https://[invalid'])
def test_commit_url_is_a_validated_label_only(client, admin, url):
    assert client.post('/api/commit-demo/runs', headers=admin, json={'example_id': 'safe', 'reset_agent': True, 'commit_url': url}).status_code == 422
    assert not EXECUTIONS

def test_custom_commit_label_keeps_fixture_code(client, admin):
    run = start(client, admin, 'safe', commit_url='https://github.com/example/project/commit/abcdef1', trigger='pull_request')
    assert run['commit']['repository'] == 'example/project'
    assert run['commit']['sha'] == 'abcdef1'
    assert run['commit']['fixture'] and 'display_name' in run['commit']['diff']
    assert 'session_digest' not in run

def test_new_session_supersedes_incomplete_commit_run(client, admin):
    old = start(client, admin, 'safe')
    start(client, admin)
    assert client.get(f'/api/commit-demo/runs/{old["id"]}').json()['workflow_status'] == 'SUPERSEDED'
    assert client.post(f'/api/commit-demo/runs/{old["id"]}/advance', headers=admin, json={'expected_step': 0}).status_code == 409
    assert not EXECUTIONS

def test_commit_demo_respects_global_stop_before_and_during_run(client, admin):
    run = start(client, admin, 'safe')
    client.post('/api/system/emergency-stop', headers=admin)
    assert client.post('/api/commit-demo/runs', headers=admin, json={'example_id': 'safe', 'reset_agent': True}).status_code == 409
    assert client.post(f'/api/commit-demo/runs/{run["id"]}/advance', headers=admin, json={'expected_step': 0}).status_code == 409
    assert not EXECUTIONS

def test_commit_demo_does_not_override_edited_policy(client, admin):
    policy = next(item['policy'] for item in client.get('/api/policies').json() if item['agent_id'] == 'coding-agent')
    policy['deny'].append('run_tests')
    assert client.put('/api/policies/coding-agent', headers=admin, json=policy).status_code == 200
    run = finish(client, admin, start(client, admin, 'safe'))
    assert run['test_status'] == 'FAIL' and run['events'][1]['decision'] == 'BLOCK'
    assert not run['events'][1]['executed']

def test_new_commit_demo_cancels_old_pending_patch(client, admin):
    old = finish(client, admin, start(client, admin, 'approval'))
    start(client, admin, 'safe')
    report = client.get(f'/api/commit-demo/runs/{old["id"]}').json()
    assert report['workflow_status'] == 'CANCELLED'
    assert report['events'][-1]['review_status'] == 'CANCELLED'
    assert client.post(f'/api/events/{old["events"][-1]["id"]}/review', headers=admin, json={'decision': 'APPROVE'}).status_code == 409
    assert len(EXECUTIONS) == 2
