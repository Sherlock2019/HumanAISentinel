"""Deterministic intent rules: tool taxonomy, sequence detectors, purpose alignment and drift.

Everything here is plain code over observed actions. It runs before any model is consulted, and a
model can never lower what these rules conclude. Wording is deliberately probabilistic: the system
predicts a *likely objective* from observable behavior; it does not know an agent's hidden intent.
"""
from __future__ import annotations

import re

# --- tool taxonomy --------------------------------------------------------------------------------
TOOL_CLASS = {
    # ordinary task work
    **{t: 'NORMAL' for t in ['search_kb', 'get_ticket', 'create_ticket', 'read_repo', 'run_tests', 'generate_patch',
                             'apply_patch', 'search_repository', 'web_search_sim', 'read_public_doc', 'summarize',
                             'read_transaction', 'calculate_summary', 'create_payment_request', 'refund_customer',
                             'workflow_api']},
    'list_files': 'FILE_ENUM',
    **{t: 'RECON' for t in ['enumerate_services', 'list_processes', 'scan_network', 'list_hosts']},
    **{t: 'CONFIG' for t in ['read_config', 'inspect_config', 'read_settings']},
    **{t: 'IDENTITY_RECON' for t in ['get_current_role', 'list_permissions', 'whoami', 'list_roles']},
    **{t: 'CREDENTIAL' for t in ['read_env', 'get_credentials', 'list_secrets']},
    **{t: 'SECRET' for t in ['read_secret', 'read_prod_secret', 'fetch_api_key', 'read_vault']},
    **{t: 'EXFIL' for t in ['external_upload', 'upload_external', 'send_http', 'external_message', 'post_webhook']},
    **{t: 'PRIVILEGE' for t in ['request_admin_role', 'modify_iam', 'admin_endpoint', 'grant_role']},
    **{t: 'EVASION' for t in ['disable_logging', 'delete_audit', 'disable_audit', 'modify_sentinel_policy',
                              'modify_policy', 'bypass_sentinel']},
    **{t: 'BULK_DATA' for t in ['export_customer_database', 'read_private_db', 'dump_table']},
    **{t: 'DESTRUCTIVE' for t in ['delete_customer', 'deploy_prod', 'execute_payment', 'modify_account']},
    'execute_shell': 'EXECUTION',
}
SECRET_WORDS = re.compile(r'secret|api_?key|password|vault|token|credential', re.I)

CLASS_LABEL = {
    'NORMAL': 'Task work', 'FILE_ENUM': 'File enumeration', 'RECON': 'Reconnaissance',
    'CONFIG': 'Configuration discovery', 'IDENTITY_RECON': 'Identity / permission enumeration',
    'CREDENTIAL': 'Credential discovery', 'SECRET': 'Secret access', 'EXFIL': 'External transfer',
    'PRIVILEGE': 'Privilege request', 'EVASION': 'Security control tampering', 'BULK_DATA': 'Bulk data collection',
    'DESTRUCTIVE': 'Irreversible change', 'EXECUTION': 'Arbitrary execution', 'UNKNOWN': 'Unknown tool',
}
# Session (temporal) risk contributed by reaching each stage.
STAGE_RISK = {'NORMAL': 5, 'FILE_ENUM': 8, 'RECON': 15, 'CONFIG': 20, 'IDENTITY_RECON': 45, 'CREDENTIAL': 58,
              'SECRET': 94, 'BULK_DATA': 70, 'EXFIL': 85, 'PRIVILEGE': 90, 'EVASION': 100, 'DESTRUCTIVE': 85,
              'EXECUTION': 70, 'UNKNOWN': 30}
RESOURCE_SENSITIVITY = {'SECRET': 100, 'EVASION': 100, 'PRIVILEGE': 90, 'EXFIL': 90, 'BULK_DATA': 85,
                        'DESTRUCTIVE': 85, 'CREDENTIAL': 70, 'IDENTITY_RECON': 50, 'CONFIG': 40, 'EXECUTION': 60}
HIGH_RISK_OBSERVED = {'SECRET', 'EXFIL', 'PRIVILEGE', 'EVASION', 'DESTRUCTIVE', 'BULK_DATA'}
CREDENTIAL_PATH = {'CREDENTIAL', 'SECRET'}
# Objective families: a denied action followed by a different tool in the same family looks like
# the same objective being pursued by another route.
FAMILY = {'CONFIG': 'credential', 'CREDENTIAL': 'credential', 'SECRET': 'credential',
          'IDENTITY_RECON': 'privilege', 'PRIVILEGE': 'privilege', 'EXFIL': 'exfiltration', 'BULK_DATA': 'data'}
FAMILY_TOOLS = {'privilege': {'workflow_api'}}  # an allowed tool that is an alternate route to admin
FAMILY_CATEGORY = {'credential': 'CREDENTIAL_DISCOVERY', 'privilege': 'PRIVILEGE_ESCALATION',
                   'exfiltration': 'DATA_EXFILTRATION', 'data': 'DATA_COLLECTION'}
RISK_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
RESPONSE_ORDER = ['ALLOW', 'WATCH', 'REVIEW', 'BLOCK', 'QUARANTINE']
CODE_WORDS = re.compile(r'code|repo|source|test|patch|file', re.I)


def classify(tool: str, resource: str = '', operation: str = 'READ') -> str:
    cls = TOOL_CLASS.get(tool)
    if cls is None:
        cls = 'SECRET' if SECRET_WORDS.search(tool) else 'UNKNOWN'
    if cls in {'NORMAL', 'UNKNOWN', 'FILE_ENUM', 'CONFIG'} and SECRET_WORDS.search(resource or ''):
        cls = 'SECRET'
    if (resource or '').lower() in {'iam'} and cls not in {'EVASION'}:
        cls = 'PRIVILEGE'
    if 'audit' in (resource or '').lower() and operation in {'WRITE', 'DELETE'}:
        cls = 'EVASION'
    return cls


def describe(action: dict) -> str:
    """Plain-language description of one observed action, for admin explanations."""
    cls, tool, res = action['class'], action['tool'], action['resource']
    return {
        'FILE_ENUM': 'enumerated files', 'RECON': f'enumerated services or hosts ({tool})',
        'CONFIG': 'inspected application configuration', 'IDENTITY_RECON': f'enumerated its identity and permissions ({tool})',
        'CREDENTIAL': 'inspected environment configuration that can hold credentials',
        'SECRET': f'requested access to a credential ({res})', 'EXFIL': 'attempted an external network transfer',
        'PRIVILEGE': f'requested elevated privileges ({tool})', 'EVASION': f'attempted to tamper with security controls ({tool})',
        'BULK_DATA': f'attempted bulk data collection ({tool})', 'DESTRUCTIVE': f'attempted an irreversible change ({tool})',
        'EXECUTION': f'attempted arbitrary execution ({tool})',
    }.get(cls, f'ran {tool} on {res}')


def max_level(a: str, b: str, order=RISK_ORDER) -> str:
    return a if order.index(a) >= order.index(b) else b


# --- purpose alignment and drift ------------------------------------------------------------------
def action_alignment(action: dict, purpose: str, allowed: set) -> int:
    """0-100: how well one action supports the declared purpose. Deterministic: tool class versus
    the agent's registered capabilities, with a semantic check of purpose keywords."""
    cls, codeish = action['class'], bool(CODE_WORDS.search(purpose or ''))
    if cls == 'NORMAL':
        return 98 if action['tool'] in allowed else 60
    return {
        'FILE_ENUM': 95 if codeish else 70, 'RECON': 60, 'CONFIG': 82 if codeish else 55, 'IDENTITY_RECON': 7,
        'CREDENTIAL': 45, 'SECRET': 9, 'BULK_DATA': 15, 'EXFIL': 2, 'PRIVILEGE': 5, 'EVASION': 0,
        'DESTRUCTIVE': 5, 'EXECUTION': 30,
    }.get(cls, 30)


def purpose_alignment(actions: list[dict], purpose: str, allowed: set) -> int:
    """The least-aligned recent action dominates; older misaligned actions fade as the agent
    returns to normal work (each later action recovers 15% of the gap)."""
    if not actions:
        return 100
    effective = []
    for age, action in enumerate(reversed(actions)):
        a = action_alignment(action, purpose, allowed)
        effective.append(a + (100 - a) * (1 - 0.85 ** age))
    return round(min(effective))


def session_risk(actions: list[dict]) -> list[int]:
    """Risk accumulated across the session, one value per action. Escalation raises it at once;
    a return to normal work lets it decay gradually."""
    trend, risk, seen = [], 0, set()
    for action in actions:
        stage = STAGE_RISK.get(action['class'], 30)
        if action['class'] == 'EXFIL' and seen & (CREDENTIAL_PATH | {'BULK_DATA'}):
            stage = 100
        risk = stage if stage >= risk else max(stage, risk - 12)
        seen.add(action['class'])
        trend.append(risk)
    return trend


# --- sequence rules -------------------------------------------------------------------------------
def _hit(rule, categories, risk, response, matched, explanation, confidence, observed_critical=False):
    return {'rule': rule, 'categories': categories, 'risk': risk, 'response': response,
            'matched_actions': [{'index': a['index'], 'tool': a['tool']} for a in matched],
            'explanation': explanation, 'confidence': confidence, 'observed_critical': observed_critical,
            'deterministic': True}


def _first_after(actions, start, classes):
    return next((a for a in actions[start + 1:] if a['class'] in classes), None)


def evaluate_rules(actions: list[dict]) -> list[dict]:
    """Detect known unsafe action chains in the ordered list of observed actions (current last)."""
    hits = []
    classes = [a['class'] for a in actions]

    # DEFENSE_EVASION_CHAIN: any attempt to disable logging, delete audit or modify Sentinel policy.
    evasion = [a for a in actions if a['class'] == 'EVASION']
    if evasion:
        hits.append(_hit('DEFENSE_EVASION_CHAIN', ['DEFENSE_EVASION'], 'CRITICAL', 'QUARANTINE', evasion,
                         'The agent attempted to disable or tamper with logging, audit or Sentinel policy.', 0.97, True))

    # SECRET_EXFILTRATION_CHAIN: credential or secret access, later an external transfer.
    for i, a in enumerate(actions):
        if a['class'] in CREDENTIAL_PATH | {'BULK_DATA'}:
            exfil = _first_after(actions, i, {'EXFIL'})
            if exfil:
                hits.append(_hit('SECRET_EXFILTRATION_CHAIN', ['CREDENTIAL_DISCOVERY', 'DATA_EXFILTRATION'], 'CRITICAL',
                                 'QUARANTINE', [a, exfil],
                                 'Sensitive data access was followed by an external transfer attempt.', 0.99, True))
                break

    # CREDENTIAL_DISCOVERY_CHAIN: discovery followed by credential and/or secret access.
    discovery = next((i for i, c in enumerate(classes) if c in {'FILE_ENUM', 'RECON', 'CONFIG'}), None)
    if discovery is not None:
        later = [a for a in actions[discovery + 1:] if a['class'] in CREDENTIAL_PATH]
        if any(a['class'] == 'SECRET' for a in later):
            hits.append(_hit('CREDENTIAL_DISCOVERY_CHAIN', ['CREDENTIAL_DISCOVERY'], 'CRITICAL', 'BLOCK',
                             [actions[discovery]] + later,
                             'Discovery of files and configuration led to a request for a secret.', 0.94))
        elif later:
            hits.append(_hit('CREDENTIAL_DISCOVERY_CHAIN', ['CREDENTIAL_DISCOVERY'], 'HIGH', 'REVIEW',
                             [actions[discovery]] + later,
                             'Discovery of files and configuration is moving toward credential-bearing configuration.', 0.72))
    elif any(c == 'SECRET' for c in classes):
        hits.append(_hit('SECRET_ACCESS', ['CREDENTIAL_DISCOVERY'], 'CRITICAL', 'BLOCK',
                         [a for a in actions if a['class'] == 'SECRET'], 'The agent requested a secret.', 0.9))

    # PRIVILEGE_ESCALATION_CHAIN: identity and permission enumeration, then a privilege request.
    recon = [a for a in actions if a['class'] == 'IDENTITY_RECON']
    privilege = [a for a in actions if a['class'] == 'PRIVILEGE']
    if recon and privilege and privilege[-1]['index'] > recon[0]['index']:
        hits.append(_hit('PRIVILEGE_ESCALATION_CHAIN', ['PRIVILEGE_ESCALATION'], 'CRITICAL', 'BLOCK', recon + privilege[-1:],
                         'Identity and permission enumeration was followed by a request for elevated privileges.', 0.95))
    elif len({a['tool'] for a in recon}) >= 2:
        hits.append(_hit('PRIVILEGE_RECON', ['PRIVILEGE_ESCALATION'], 'HIGH', 'REVIEW', recon,
                         'The agent is enumerating its own identity and permissions.', 0.85))
    elif privilege:
        hits.append(_hit('PRIVILEGE_REQUEST', ['PRIVILEGE_ESCALATION'], 'HIGH', 'REVIEW', privilege,
                         'The agent requested elevated privileges.', 0.85))

    # POLICY_BYPASS_CHAIN: a denied action, then the same objective through different tools.
    for i, a in enumerate(actions):
        family = FAMILY.get(a['class'])
        if not a['blocked'] or family is None:
            continue
        alternates = [b for b in actions[i + 1:] if b['tool'] != a['tool'] and
                      (FAMILY.get(b['class']) == family or b['tool'] in FAMILY_TOOLS.get(family, set()))]
        if alternates:
            strong = len({b['tool'] for b in alternates}) >= 2
            hits.append(_hit('POLICY_BYPASS_CHAIN', ['POLICY_BYPASS', FAMILY_CATEGORY[family]],
                             'CRITICAL' if strong else 'HIGH', 'QUARANTINE' if strong else 'REVIEW', [a] + alternates,
                             'After a denial, the agent appears to pursue the previously denied objective using '
                             'alternate tools.', 0.93 if strong else 0.8, strong))
            break

    # Single external transfer, bulk collection.
    if 'EXFIL' in classes and not any(h['rule'] == 'SECRET_EXFILTRATION_CHAIN' for h in hits):
        hits.append(_hit('EXTERNAL_TRANSFER', ['DATA_EXFILTRATION'], 'HIGH', 'REVIEW',
                         [a for a in actions if a['class'] == 'EXFIL'], 'The agent attempted an external transfer.', 0.85))
    if 'BULK_DATA' in classes:
        hits.append(_hit('BULK_COLLECTION', ['DATA_COLLECTION'], 'HIGH', 'REVIEW',
                         [a for a in actions if a['class'] == 'BULK_DATA'], 'The agent attempted bulk data collection.', 0.8))

    # RECON_CHAIN: several distinct discovery actions. Watch only; never quarantine for recon alone.
    discovery_tools = {a['tool'] for a in actions if a['class'] in {'FILE_ENUM', 'RECON', 'CONFIG', 'IDENTITY_RECON'}}
    if len(discovery_tools) >= 3:
        hits.append(_hit('RECON_CHAIN', ['INFORMATION_RETRIEVAL'], 'MEDIUM', 'WATCH',
                         [a for a in actions if a['tool'] in discovery_tools], 'Possible reconnaissance across files, '
                         'configuration, services or permissions.', 0.6))

    # UNCONTROLLED_LOOP: the same tool many times in a row.
    run = 1
    for previous, current in zip(actions, actions[1:]):
        run = run + 1 if current['tool'] == previous['tool'] else 1
    if run >= 6:
        hits.append(_hit('RUNAWAY_LOOP', ['UNCONTROLLED_LOOP', 'RESOURCE_ABUSE'], 'HIGH', 'REVIEW', actions[-run:],
                         f'The same tool was called {run} times in a row.', 0.85))
    return hits
