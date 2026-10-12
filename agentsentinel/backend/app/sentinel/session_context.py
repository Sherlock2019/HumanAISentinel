"""Session context builder: the full recent history of an agent thread, not just the current call."""
from __future__ import annotations

from collections import Counter

from sqlalchemy import select

from app.config import INTENT_HISTORY_WINDOW
from app.models.records import Agent, AgentSession, Policy, SessionAction
from app.sentinel.intent_rules import FAMILY, classify, describe


def action_record(tool, resource, operation='READ', decision='ALLOW', index=0, policy_decision=None,
                  blocked=None, current=False):
    return {'index': index, 'tool': tool, 'resource': resource, 'operation': operation,
            'class': classify(tool, resource, operation), 'decision': decision,
            'policy_decision': policy_decision or decision,
            'blocked': decision == 'BLOCK' if blocked is None else blocked, 'current': current}


def summarize(declared_purpose: str, user_objective: str, actions: list[dict], allowed: set,
              behavior_score: int = 0) -> dict:
    """Pure function: build the intent context from an ordered list of action records (current last)."""
    for action in actions:
        action['description'] = describe(action)
    history = [a for a in actions if not a.get('current')]
    current = next((a for a in actions if a.get('current')), None)
    counts = Counter(a['tool'] for a in actions)
    denied = [a for a in actions if a['blocked']]
    retries = [{'tool': d['tool'], 'later_alternates': [b['tool'] for b in actions[actions.index(d) + 1:]
                                                       if FAMILY.get(b['class']) == FAMILY.get(d['class'])
                                                       and b['tool'] != d['tool']]}
               for d in denied if FAMILY.get(d['class'])]
    return {
        'declared_purpose': declared_purpose,
        'user_objective': user_objective,
        'allowed_tools': sorted(allowed),
        'recent_actions': actions,
        'history': history,
        'current_action': current,
        'blocked_actions': denied,
        'resources_accessed': list(dict.fromkeys(a['resource'] for a in actions)),
        'tools_used': list(dict.fromkeys(a['tool'] for a in actions)),
        'retries': [r for r in retries if r['later_alternates']],
        'policy_history': [{'tool': a['tool'], 'policy_decision': a['policy_decision'], 'decision': a['decision']}
                           for a in actions],
        'behavior_score': behavior_score,
        # derived summaries
        'tools_used_sequence': [a['tool'] for a in actions],
        'resource_sequence': [a['resource'] for a in actions],
        'class_sequence': [a['class'] for a in actions],
        'write_operations': [a['tool'] for a in actions if a['operation'] in {'WRITE', 'DELETE', 'EXECUTE'}],
        'external_network_calls': [a['tool'] for a in actions if a['class'] == 'EXFIL'],
        'secret_access_attempts': [a['tool'] for a in actions if a['class'] in {'SECRET', 'CREDENTIAL'}],
        'denied_attempts': [a['tool'] for a in denied],
        'repeated_tool_calls': {tool: n for tool, n in counts.items() if n > 1},
    }


def session_actions(db, session_id: str, window: int | None = None) -> list[SessionAction]:
    window = window or INTENT_HISTORY_WINDOW
    rows = list(db.scalars(select(SessionAction).where(SessionAction.session_id == session_id)
                           .order_by(SessionAction.sequence_index.desc()).limit(window)))
    return list(reversed(rows))


def build_session_context(db, session_id: str, current_action: dict | None = None, behavior_score: int = 0,
                          window: int | None = None) -> dict:
    """Context for the Intent Engine: the last INTENT_HISTORY_WINDOW actions plus the proposed one."""
    window = window or INTENT_HISTORY_WINDOW
    session = db.get(AgentSession, session_id)
    agent = db.get(Agent, session.agent_id)
    policy = (db.get(Policy, agent.id).data if agent else {}) or {}
    rows = session_actions(db, session_id, window - (1 if current_action else 0))
    actions = [action_record(r.tool, r.resource, r.operation, r.final_decision, r.sequence_index, r.policy_decision,
                             r.blocked) for r in rows]
    if current_action:
        actions.append({**current_action, 'current': True})
    allowed = set(policy.get('allow', [])) | set(policy.get('require_approval', []))
    context = summarize(session.declared_purpose, session.user_objective, actions, allowed, behavior_score)
    context.update({'session_id': session_id, 'agent_id': session.agent_id,
                    'agent_name': agent.name if agent else session.agent_id, 'window': window})
    return context
