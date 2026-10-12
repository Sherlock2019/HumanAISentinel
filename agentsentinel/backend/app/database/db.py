from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from app.config import DATABASE_URL

class Base(DeclarativeBase):
    pass

engine = create_engine(DATABASE_URL, connect_args={'check_same_thread': False} if DATABASE_URL.startswith('sqlite') else {})
SessionLocal = sessionmaker(engine, expire_on_commit=False)

def get_db():
    with SessionLocal() as session:
        yield session

def initialize():
    from app.models import records  # register all tables
    Base.metadata.create_all(engine)
    # Additive migration for an earlier POC database; preserve existing evidence.
    if 'credential_hash' not in {c['name'] for c in inspect(engine).get_columns('agents')}:
        with engine.begin() as connection:
            connection.execute(text('ALTER TABLE agents ADD COLUMN credential_hash VARCHAR'))
