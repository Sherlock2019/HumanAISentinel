from contextlib import asynccontextmanager
import threading
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.database.db import initialize, SessionLocal
from app.database.seed import seed
from app.config import AI_PROVIDER
from app.api import agents, actions, alerts, policies, audit, metrics, redteam, system, commit_demo, sessions

@asynccontextmanager
async def lifespan(app):
    initialize()
    with SessionLocal() as db:
        seed(db)
    yield

app = FastAPI(title='AgentSentinel', description='AI Agent Runtime Safety Guard — simulated tools only', lifespan=lifespan)
ui_port = os.getenv('SENTINEL_UI_PORT', '5174')
app.add_middleware(CORSMiddleware, allow_origins=list({
    'http://localhost:5173', 'http://127.0.0.1:5173',  # Docker Compose compatibility.
    f'http://localhost:{ui_port}', f'http://127.0.0.1:{ui_port}',
}), allow_methods=['*'], allow_headers=['*'])
# Serialize mutations in this single-process POC so audit hashes and state
# transitions cannot race. Production needs database-level locking per tenant.
mutation_lock = threading.Lock()

@app.middleware('http')
async def serialize_mutations(request: Request, call_next):
    if request.method in {'POST', 'PUT', 'DELETE'}:
        import asyncio
        await asyncio.to_thread(mutation_lock.acquire)
        try:
            return await call_next(request)
        finally:
            mutation_lock.release()
    return await call_next(request)

for router in [agents.router, actions.router, alerts.router, policies.router, audit.router, metrics.router, redteam.router, system.router, commit_demo.router, sessions.router]:
    app.include_router(router)

@app.get('/health')
def health():
    with SessionLocal() as db:
        db.execute(text('SELECT 1'))
    return {'status': 'healthy', 'gateway': 'online', 'database': 'online', 'ai_provider': AI_PROVIDER}
