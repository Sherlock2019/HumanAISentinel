import csv
import io
import json
import hashlib
from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from app.database.db import get_db
from app.models.records import AuditLog

router = APIRouter(prefix='/api/audit', tags=['Audit'])

@router.get('')
def audit(agent_id: str | None = None, format: str | None = None, db=Depends(get_db)):
    rows = [{'id': a.id, 'timestamp': a.timestamp.isoformat(), 'previous_hash': a.previous_hash, 'hash': a.hash, **a.payload} for a in db.scalars(select(AuditLog).order_by(AuditLog.timestamp.desc()))]
    if agent_id:
        rows = [r for r in rows if r.get('agent_id') == agent_id or r.get('payload', {}).get('agent_id') == agent_id]
    if format == 'json':
        return Response(json.dumps(rows, indent=2), media_type='application/json', headers={'Content-Disposition': 'attachment; filename=agentsentinel-audit.json'})
    if format == 'csv':
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['id', 'timestamp', 'kind', 'agent_id', 'event_id', 'decision', 'risk', 'hash', 'evidence_json'])
        for row in rows:
            values = [row.get(k, '') for k in ['id', 'timestamp', 'kind', 'agent_id', 'event_id', 'decision', 'final_risk', 'hash']]
            writer.writerow(["'"+str(v) if str(v).startswith(('=', '+', '-', '@')) else v for v in values] + [json.dumps(row)])
        return Response(output.getvalue(), media_type='text/csv', headers={'Content-Disposition': 'attachment; filename=agentsentinel-audit.csv'})
    return rows[:500]

@router.get('/verify')
def verify(db=Depends(get_db)):
    previous = '0'*64
    count = 0
    for item in db.scalars(select(AuditLog).order_by(AuditLog.timestamp)):
        expected = hashlib.sha256((previous + json.dumps(item.payload, sort_keys=True, default=str)).encode()).hexdigest()
        if item.previous_hash != previous or item.hash != expected:
            return {'valid': False, 'checked': count, 'failed_id': item.id}
        previous = item.hash
        count += 1
    return {'valid': True, 'checked': count, 'head_hash': previous}
