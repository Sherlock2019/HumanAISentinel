from datetime import timedelta
from sqlalchemy import select
from app.models.records import BehaviorHistory, utcnow

def evaluate(db, agent, action, policy):
    history = list(db.scalars(select(BehaviorHistory).where(BehaviorHistory.agent_id == agent.id, BehaviorHistory.timestamp >= utcnow() - timedelta(seconds=60)).order_by(BehaviorHistory.timestamp.desc())))
    reasons, score = [], 5
    blocked = sum(h.decision == 'BLOCK' for h in history)
    rate = len(history) + 1
    if rate > policy['rate_limit']:
        reasons.append('Actions per minute exceeded the agent’s rate limit.')
        score = 90
    if blocked:
        reasons.append(f'{blocked} blocked attempt(s) in the previous 60 seconds.')
        score = max(score, min(90, blocked * 30))
    if sum(h.cost for h in history) + action.simulated_cost > policy['cost_limit']:
        reasons.append('Synthetic cost budget exceeded within the last minute.')
        score = 90
    if len(history) >= 5 and all(h.tool == action.tool for h in history[:5]):
        reasons.append('Repeated identical tool calls suggest a runaway loop.')
        score = max(score, 80)
    if action.tool not in policy['allow'] + policy['require_approval']:
        reasons.append('Tool use deviates from the registered capability baseline.')
        score = max(score, 65)
    if 'secret' in action.tool or action.tool in {'modify_iam', 'disable_logging'}:
        score = 91
        reasons.append('Sensitive action is unrelated to the normal task sequence.')
    return {'score': score, 'reasons': reasons, 'blocked_recent': blocked, 'actions_per_minute': rate, 'history': [{'tool': h.tool, 'resource': h.resource, 'decision': h.decision} for h in history[:10]]}
