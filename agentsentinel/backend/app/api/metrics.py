from collections import Counter, defaultdict
from datetime import timezone
from zoneinfo import ZoneInfo
import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from app.database.db import get_db
from app.models.records import Event, Agent, Alert
from app.sentinel.capability_engine import graph

router = APIRouter(tags=['Metrics'])

@router.get('/api/metrics')
def metrics(db=Depends(get_db)):
    events, agents, alerts = list(db.scalars(select(Event))), list(db.scalars(select(Agent))), list(db.scalars(select(Alert)))
    decisions, severities, tools = Counter(e.decision for e in events), Counter(e.severity for e in events), Counter(e.payload['action']['tool'] for e in events)
    risky = [e for e in events if e.decision == 'BLOCK']
    timeline = defaultdict(lambda: {'actions': 0, 'blocked': 0, 'risk': 0})
    for event in sorted(events, key=lambda e: e.timestamp):
        timestamp = event.timestamp if event.timestamp.tzinfo else event.timestamp.replace(tzinfo=timezone.utc)
        key = timestamp.astimezone(ZoneInfo(os.getenv('TIMEZONE', 'Asia/Ho_Chi_Minh'))).strftime('%H:%M')
        timeline[key]['actions'] += 1
        timeline[key]['blocked'] += event.decision == 'BLOCK'
        timeline[key]['risk'] += event.risk_score
    return {'total_actions': len(events), 'allowed': decisions['ALLOW'], 'blocked': decisions['BLOCK'], 'review': decisions['REVIEW'], 'critical_events': severities['CRITICAL'], 'quarantined_agents': sum(a.status == 'QUARANTINED' for a in agents), 'active_agents': sum(a.status in {'RUNNING', 'REVIEW'} for a in agents), 'safe_agents': sum(a.status == 'RUNNING' and a.risk_score < 30 for a in agents), 'under_review': sum(a.status == 'REVIEW' for a in agents), 'critical_alerts': sum(a.severity == 'CRITICAL' and not a.acknowledged for a in alerts), 'average_risk': round(sum(e.risk_score for e in events)/len(events), 1) if events else 0, 'health_score': round(100-sum(a.risk_score for a in agents)/max(len(agents), 1)), 'top_risky_tool': Counter(e.payload['action']['tool'] for e in risky).most_common(1)[0][0] if risky else 'None', 'top_risky_agent': Counter(e.payload['agent_name'] for e in risky).most_common(1)[0][0] if risky else 'None', 'prompt_injection_detections': sum(e.payload['llm_result']['injection_risk'] == 5 for e in events), 'policy_violations': sum(e.payload['policy_result']['decision'] == 'BLOCK' for e in events), 'tool_abuse_attempts': sum(e.payload['behavior']['score'] >= 65 for e in events), 'decisions': [{'name': k, 'value': v} for k, v in decisions.items()], 'severity': [{'name': k, 'value': v} for k, v in severities.items()], 'tools': [{'name': k, 'value': v} for k, v in tools.items()], 'ranking': [{'name': a.name, 'risk': a.risk_score} for a in sorted(agents, key=lambda a: a.risk_score, reverse=True)], 'timeline': [{'time': k, **v, 'risk': round(v['risk']/v['actions'])} for k, v in timeline.items()][-30:]}

@router.get('/api/capabilities/{agent_id}')
def capabilities(agent_id: str, db=Depends(get_db)):
    if not db.get(Agent, agent_id):
        raise HTTPException(404, 'Agent not found')
    return graph(db, agent_id)
