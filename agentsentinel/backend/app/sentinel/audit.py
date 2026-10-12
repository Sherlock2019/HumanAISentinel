import hashlib
import json
import re
from uuid import uuid4
from sqlalchemy import select
from app.models.records import AuditLog, utcnow

def redact(value):
    if isinstance(value, dict):
        sensitive = r'^(?:authorization|password|api[-_]?key|credentials?|secret|token)$|(?:^|_)(?:password|api_key|token|secret|credential)(?:_value)?$'
        return {key: '[REDACTED]' if re.search(sensitive, key, re.I) else redact(item) for key, item in value.items()}
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value

def append(db, payload):
    previous = db.scalar(select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(1))
    previous_hash = previous.hash if previous else '0' * 64
    timestamp = utcnow()
    safe = redact(payload)
    safe['audit_timestamp'] = timestamp.isoformat()
    digest = hashlib.sha256((previous_hash + json.dumps(safe, sort_keys=True, default=str)).encode()).hexdigest()
    record = AuditLog(id=str(uuid4()), timestamp=timestamp, payload=safe, previous_hash=previous_hash, hash=digest)
    db.add(record)
    db.flush()
    return record
