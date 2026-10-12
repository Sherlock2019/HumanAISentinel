from sqlalchemy import select
from app.models.records import Agent, Policy, CapabilityEdge, Setting
from app.schemas.contracts import SettingsData
import hashlib

DEMO_AGENTS = [
    ('support-agent', 'CustomerSupportAgent', 'Answer support questions and create support tickets.', 'Customer experience', ['search_kb', 'get_ticket', 'create_ticket', 'workflow_api'], ['refund_customer'], ['read_secret', 'execute_shell', 'modify_iam', 'delete_customer'], ['knowledge_base', 'support_db', 'workflow_api']),
    ('research-agent', 'ResearchAgent', 'Search public synthetic knowledge and summarize research.', 'Research team', ['web_search_sim', 'read_public_doc', 'summarize'], [], ['upload_external', 'read_private_db', 'execute_shell'], ['public_docs', 'public_web']),
    ('coding-agent', 'CodingAgent', 'Read code, run tests and suggest patches for source code review.', 'Engineering', ['read_repo', 'run_tests', 'generate_patch', 'list_files', 'read_config', 'read_env', 'search_repository'], ['apply_patch'], ['read_prod_secret', 'deploy_prod', 'modify_iam', 'disable_logging'], ['demo_repo', 'test_runner', 'app_config', 'environment']),
    ('finance-agent', 'FinanceAgent', 'Analyze synthetic financial transactions and summarize financial activity.', 'Finance operations', ['read_transaction', 'calculate_summary'], ['create_payment_request'], ['execute_payment', 'modify_account', 'export_customer_database'], ['transactions', 'payment_requests']),
]

INTENT_DEMO_CAPABILITIES = {
    'allow': ['list_files', 'read_config', 'read_env', 'search_repository'],
    'resources_allow': ['app_config', 'environment'],
}

def seed(db):
    for id, name, purpose, owner, allow, approval, deny, resources in DEMO_AGENTS:
        if not db.get(Agent, id):
            token = f'demo-{id}-token'
            db.add(Agent(id=id, name=name, purpose=purpose, owner=owner, token=token, credential_hash=hashlib.sha256(token.encode()).hexdigest(), risk_score={'support-agent': 8, 'research-agent': 14, 'coding-agent': 12, 'finance-agent': 10}[id]))
            db.add(Policy(agent_id=id, data={'allow': allow, 'require_approval': approval, 'deny': deny, 'resources_allow': resources, 'resources_deny': ['production_secrets', 'AWS_PRODUCTION_TOKEN', 'iam', 'payroll', 'customer_database'], 'network_destinations': ['internal.demo'], 'rate_limit': 20, 'cost_limit': 5, 'risk_sensitivity': 'standard'}))
            edges = [(id, tool, False) for tool in allow + approval]
            if id == 'support-agent':
                edges += [('workflow_api', 'admin_endpoint', False), ('admin_endpoint', 'customer_database_write', True)]
            if id == 'coding-agent':
                edges += [(id, 'read_prod_secret', True), ('read_prod_secret', 'AWS_PRODUCTION_TOKEN', True)]
            for n, (source, target, dangerous) in enumerate(edges):
                db.add(CapabilityEdge(id=f'{id}-{n}', agent_id=id, source=source, target=target, dangerous=dangerous))
    # Intent Sentinel demo: each of these is individually harmless and permitted, so per-call policy
    # alone would allow them. Only the sequence reveals the risk. Additive upgrade for older databases.
    coding = db.get(Policy, 'coding-agent')
    if coding:
        data = dict(coding.data)
        for key, items in INTENT_DEMO_CAPABILITIES.items():
            data[key] = list(data.get(key, [])) + [item for item in items if item not in data.get(key, [])]
        if data != coding.data:
            coding.data = data
    for agent in db.scalars(select(Agent)):
        if agent.token and not agent.credential_hash:
            agent.credential_hash = hashlib.sha256(agent.token.encode()).hexdigest()
    if not db.get(Setting, 'runtime'):
        db.add(Setting(id='runtime', data={**SettingsData().model_dump(), 'emergency_stopped': False}))
    db.commit()
