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

class AgentSession(Base):
    """One agent thread. Intent is judged across the session, not per tool call."""
    __tablename__ = 'agent_sessions'
    session_id: Mapped[str] = mapped_column(String, primary_key=True)
    agent_id: Mapped[str] = mapped_column(String, index=True)
    declared_purpose: Mapped[str] = mapped_column(String)
    user_objective: Mapped[str] = mapped_column(String, default='')
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    status: Mapped[str] = mapped_column(String, default='ACTIVE')  # ACTIVE | WATCH | REVIEW | QUARANTINED | CLOSED
    intent_prediction: Mapped[str] = mapped_column(String, default='Not enough activity yet')
    intent_categories: Mapped[list] = mapped_column(JSON, default=list)
    intent_confidence: Mapped[float] = mapped_column(Float, default=0)
    intent_risk: Mapped[str] = mapped_column(String, default='LOW')
    session_risk: Mapped[int] = mapped_column(Integer, default=0)
    purpose_alignment: Mapped[int] = mapped_column(Integer, default=100)
    intent_drift: Mapped[int] = mapped_column(Integer, default=0)
    alerted_level: Mapped[str] = mapped_column(String, default='')
    last_updated: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class SessionAction(Base):
    __tablename__ = 'session_actions'
    action_id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[str] = mapped_column(String, index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    tool: Mapped[str] = mapped_column(String)
    operation: Mapped[str] = mapped_column(String)
    resource: Mapped[str] = mapped_column(String)
    arguments_summary: Mapped[str] = mapped_column(String, default='')
    result: Mapped[str] = mapped_column(String, default='')
    policy_decision: Mapped[str] = mapped_column(String)
    final_decision: Mapped[str] = mapped_column(String)
    risk_score: Mapped[int] = mapped_column(Integer, default=0)
    session_risk: Mapped[int] = mapped_column(Integer, default=0)
    blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    sequence_index: Mapped[int] = mapped_column(Integer)

class IntentPrediction(Base):
    """A concise, structured prediction. No model chain-of-thought is stored."""
    __tablename__ = 'intent_predictions'
    prediction_id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[str] = mapped_column(String, index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    sequence_index: Mapped[int] = mapped_column(Integer, default=0)
    predicted_intent: Mapped[str] = mapped_column(String)
    intent_category: Mapped[list] = mapped_column(JSON, default=list)
    confidence: Mapped[float] = mapped_column(Float)
    risk_level: Mapped[str] = mapped_column(String)
    session_risk: Mapped[int] = mapped_column(Integer, default=0)
    purpose_alignment: Mapped[int] = mapped_column(Integer, default=100)
    intent_drift: Mapped[int] = mapped_column(Integer, default=0)
    evidence_actions: Mapped[list] = mapped_column(JSON, default=list)
    reasoning_summary: Mapped[str] = mapped_column(String, default='')
    predicted_next_actions: Mapped[list] = mapped_column(JSON, default=list)
    recommended_response: Mapped[str] = mapped_column(String)
    model_provider: Mapped[str] = mapped_column(String)
    model_version: Mapped[str] = mapped_column(String, default='')
    details: Mapped[dict] = mapped_column(JSON, default=dict)

class CommitDemoRun(Base):
    __tablename__ = 'commit_demo_runs'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    example_id: Mapped[str] = mapped_column(String)
    commit: Mapped[dict] = mapped_column(JSON)
    trigger: Mapped[str] = mapped_column(String)
    session_digest: Mapped[str] = mapped_column(String)
    cursor: Mapped[int] = mapped_column(Integer, default=0)
    event_ids: Mapped[list] = mapped_column(JSON, default=list)
