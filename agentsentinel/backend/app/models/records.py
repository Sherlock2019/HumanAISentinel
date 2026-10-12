from datetime import datetime, timezone
from sqlalchemy import String, JSON, DateTime, Integer, Float, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.database.db import Base

def utcnow():
    return datetime.now(timezone.utc)

class Agent(Base):
    __tablename__ = 'agents'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    purpose: Mapped[str] = mapped_column(String)
    owner: Mapped[str] = mapped_column(String, default='Demo team')
    environment: Mapped[str] = mapped_column(String, default='Sandbox')
    status: Mapped[str] = mapped_column(String, default='RUNNING')
    token: Mapped[str | None] = mapped_column(String, nullable=True)
    credential_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    risk_score: Mapped[int] = mapped_column(Integer, default=0)
    current_task: Mapped[str] = mapped_column(String, default='Ready for a task')
    last_activity: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class Policy(Base):
    __tablename__ = 'policies'
    agent_id: Mapped[str] = mapped_column(String, primary_key=True)
    data: Mapped[dict] = mapped_column(JSON)
    version: Mapped[int] = mapped_column(Integer, default=1)

class Action(Base):
    __tablename__ = 'actions'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    agent_id: Mapped[str] = mapped_column(String)
    request: Mapped[dict] = mapped_column(JSON)
    executed: Mapped[bool] = mapped_column(Boolean, default=False)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)

class Event(Base):
    __tablename__ = 'events'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    agent_id: Mapped[str] = mapped_column(String, index=True)
    decision: Mapped[str] = mapped_column(String)
    severity: Mapped[str] = mapped_column(String)
    risk_score: Mapped[int] = mapped_column(Integer)
    payload: Mapped[dict] = mapped_column(JSON)
    review_status: Mapped[str | None] = mapped_column(String, nullable=True)

class Alert(Base):
    __tablename__ = 'alerts'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    event_id: Mapped[str] = mapped_column(String)
    agent_id: Mapped[str] = mapped_column(String)
    severity: Mapped[str] = mapped_column(String)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    payload: Mapped[dict] = mapped_column(JSON)

class AuditLog(Base):
    __tablename__ = 'audit_logs'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    payload: Mapped[dict] = mapped_column(JSON)
    previous_hash: Mapped[str] = mapped_column(String)
    hash: Mapped[str] = mapped_column(String)

class AgentState(Base):
    __tablename__ = 'agent_states'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    agent_id: Mapped[str] = mapped_column(String)
    state: Mapped[str] = mapped_column(String)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    reason: Mapped[str] = mapped_column(String)

class BehaviorHistory(Base):
    __tablename__ = 'behavior_history'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    agent_id: Mapped[str] = mapped_column(String, index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    tool: Mapped[str] = mapped_column(String)
    resource: Mapped[str] = mapped_column(String)
    decision: Mapped[str] = mapped_column(String)
    cost: Mapped[float] = mapped_column(Float, default=0)

class CapabilityEdge(Base):
    __tablename__ = 'capability_edges'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    agent_id: Mapped[str] = mapped_column(String)
    source: Mapped[str] = mapped_column(String)
    target: Mapped[str] = mapped_column(String)
    dangerous: Mapped[bool] = mapped_column(Boolean, default=False)

class Setting(Base):
    __tablename__ = 'settings'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    data: Mapped[dict] = mapped_column(JSON)
