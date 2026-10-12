import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app.database.db import initialize, SessionLocal
from app.database.seed import seed

initialize()
with SessionLocal() as db:
    seed(db)
print('AgentSentinel demo database ready (existing evidence preserved).')
