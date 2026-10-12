import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.database.db import Base, get_db
from app.database.seed import seed
from app.main import app
from app.simulator.demo_tools import EXECUTIONS

@pytest.fixture
def client():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(engine, expire_on_commit=False)
    with sessions() as db:
        seed(db)
    def override():
        with sessions() as db:
            yield db
    app.dependency_overrides[get_db] = override
    EXECUTIONS.clear()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    engine.dispose()

@pytest.fixture
def admin():
    return {'X-Admin-Token': 'local-demo-admin'}
