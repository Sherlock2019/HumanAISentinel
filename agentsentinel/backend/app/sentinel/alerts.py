from uuid import uuid4
from app.models.records import Alert
from app.sentinel.audit import append

def notify(db, agent, event, settings):
    payload = {'agent': agent.name, 'tool': event.payload['action']['tool'], 'resource': event.payload['action']['resource'], 'reasons': event.payload['reasons'], 'risk_score': event.risk_score, 'response': agent.status, 'channels': settings['alert_channels'], 'simulation': True}
    severity = 'CRITICAL' if event.severity == 'CRITICAL' else 'HIGH' if event.decision == 'BLOCK' or event.severity == 'HIGH' else 'WARNING'
    alert = Alert(id=str(uuid4()), event_id=event.id, agent_id=agent.id, severity=severity, payload=payload)
    db.add(alert)
    for channel in settings['alert_channels']:
        append(db, {'kind': 'notification', 'channel': channel, 'delivery': 'SIMULATED', 'event_id': event.id, 'payload': payload})
    return alert
