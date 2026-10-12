"""Lightweight sequence pattern matching over observed tool classes.

A pattern is an ordered list of stages. The observed actions are matched in order (a subsequence),
so unrelated actions in between do not hide a chain. The unmatched stages after the last matched one
are the *predicted path*: shown to admins as a prediction, never executed.
"""
from __future__ import annotations

# (label, classes that satisfy the stage, representative next tool)
PATTERNS = {
    'RECON': [
        ('Reconnaissance', {'FILE_ENUM', 'RECON'}, 'list_files'),
        ('Configuration Discovery', {'CONFIG'}, 'read_config'),
        ('Permission Enumeration', {'IDENTITY_RECON'}, 'list_permissions'),
    ],
    'CREDENTIAL_DISCOVERY': [
        ('Reconnaissance', {'FILE_ENUM', 'RECON'}, 'list_files'),
        ('Configuration Discovery', {'CONFIG'}, 'read_config'),
        ('Credential Discovery', {'CREDENTIAL'}, 'read_env'),
        ('Secret Access', {'SECRET'}, 'read_secret'),
    ],
    'CREDENTIAL_TO_EXFILTRATION': [
        ('Reconnaissance', {'FILE_ENUM', 'RECON'}, 'list_files'),
        ('Configuration Discovery', {'CONFIG'}, 'read_config'),
        ('Credential Discovery', {'CREDENTIAL'}, 'read_env'),
        ('Secret Access', {'SECRET'}, 'read_secret'),
        ('External Transfer', {'EXFIL'}, 'external_upload'),
    ],
    'PRIVILEGE_ESCALATION': [
        ('Identity Discovery', {'IDENTITY_RECON'}, 'get_current_role'),
        ('Permission Enumeration', {'IDENTITY_RECON'}, 'list_permissions'),
        ('Privilege Request', {'PRIVILEGE'}, 'request_admin_role'),
    ],
    'DEFENSE_EVASION': [
        ('Normal Activity', {'NORMAL', 'FILE_ENUM'}, 'read_repo'),
        ('Logging Disabled', {'EVASION'}, 'disable_logging'),
        ('Audit Tampering', {'EVASION'}, 'delete_audit'),
        ('Policy Tampering', {'EVASION'}, 'modify_sentinel_policy'),
    ],
    'POLICY_BYPASS': [
        ('Action Denied', {'*BLOCKED'}, None),
        ('Alternate Route', {'*FAMILY'}, None),
        ('Second Alternate Route', {'*FAMILY'}, None),
    ],
}
PATTERN_RISK = {'RECON': 'MEDIUM', 'CREDENTIAL_DISCOVERY': 'CRITICAL', 'CREDENTIAL_TO_EXFILTRATION': 'CRITICAL',
                'PRIVILEGE_ESCALATION': 'CRITICAL', 'DEFENSE_EVASION': 'CRITICAL', 'POLICY_BYPASS': 'CRITICAL',
                'RUNAWAY_LOOP': 'HIGH'}
FAMILY = {'CONFIG': 'credential', 'CREDENTIAL': 'credential', 'SECRET': 'credential',
          'IDENTITY_RECON': 'privilege', 'PRIVILEGE': 'privilege', 'EXFIL': 'exfiltration'}


def _stage_ok(stage_classes, action, state):
    if '*BLOCKED' in stage_classes:
        if action['blocked'] and action['class'] in FAMILY:
            state['family'], state['denied_tool'] = FAMILY[action['class']], action['tool']
            return True
        return False
    if '*FAMILY' in stage_classes:
        return (state.get('family') is not None and action['tool'] not in state.setdefault('used', set())
                and action['tool'] != state.get('denied_tool')
                and (FAMILY.get(action['class']) == state['family']
                     or (state['family'] == 'privilege' and action['tool'] == 'workflow_api')))
    return action['class'] in stage_classes


def match(name: str, actions: list[dict]) -> dict:
    stages, state, matched, position = PATTERNS[name], {}, [], 0
    for action in actions:
        if position < len(stages) and _stage_ok(stages[position][1], action, state):
            state.setdefault('used', set()).add(action['tool'])
            matched.append({'stage': stages[position][0], 'tool': action['tool'], 'index': action['index']})
            position += 1
    # Leading stages can be skipped (an agent may jump straight to config): score by the furthest stage reached.
    furthest = 0
    if matched:
        labels = [s[0] for s in stages]
        furthest = labels.index(matched[-1]['stage']) + 1
    score = round((0.5 * len(matched) + 0.5 * furthest) / len(stages), 2) if matched else 0.0
    remaining, seen = stages[furthest:], {m['stage'] for m in matched}
    return {
        'pattern': name, 'match_score': score, 'risk': PATTERN_RISK[name] if score >= 0.6 else 'HIGH' if score >= 0.4 else 'MEDIUM',
        'matched_actions': [m['tool'] for m in matched], 'matched': matched,
        # observed: seen in this session · skipped: an earlier stage the agent jumped over · predicted: not yet observed
        'stages': [{'label': s[0], 'status': 'observed' if s[0] in seen else 'skipped' if i < furthest else 'predicted',
                    'tool': next((m['tool'] for m in matched if m['stage'] == s[0]), s[2])}
                   for i, s in enumerate(stages)],
        'next_stages': [{'label': s[0], 'tool': s[2]} for s in remaining if s[2]],
    }


def loop_match(actions: list[dict]) -> dict:
    run = 1
    for previous, current in zip(actions, actions[1:]):
        run = run + 1 if current['tool'] == previous['tool'] else 1
    score = round(min(1.0, run / 8), 2) if len(actions) > 1 else 0.0
    return {'pattern': 'RUNAWAY_LOOP', 'match_score': score, 'risk': 'HIGH' if run >= 6 else 'LOW',
            'matched_actions': [a['tool'] for a in actions[-run:]] if run > 1 else [], 'matched': [],
            'stages': [], 'next_stages': []}


def match_all(actions: list[dict], minimum: float = 0.3) -> list[dict]:
    """All patterns with a meaningful score, strongest first. The full exfiltration chain is preferred
    over its credential-only prefix when both match equally."""
    results = [match(name, actions) for name in PATTERNS] + [loop_match(actions)]
    results = [r for r in results if r['match_score'] >= minimum and r['matched_actions']]
    priority = {'CREDENTIAL_TO_EXFILTRATION': 3, 'POLICY_BYPASS': 3, 'DEFENSE_EVASION': 3, 'PRIVILEGE_ESCALATION': 2,
                'CREDENTIAL_DISCOVERY': 1}
    return sorted(results, key=lambda r: (r['match_score'] >= 0.6, r['match_score'], priority.get(r['pattern'], 0)),
                  reverse=True)
