from typing import Literal
from pydantic import BaseModel, Field, model_validator

class PolicyData(BaseModel):
    allow: list[str] = Field(default_factory=list)
    require_approval: list[str] = Field(default_factory=list)
    deny: list[str] = Field(default_factory=list)
    resources_allow: list[str] = Field(default_factory=list)
    resources_deny: list[str] = Field(default_factory=list)
    network_destinations: list[str] = Field(default_factory=list)
    rate_limit: int = Field(default=20, ge=1, le=1000)
    cost_limit: float = Field(default=5, gt=0, le=10000)
    risk_sensitivity: Literal['standard', 'strict'] = 'standard'
    @model_validator(mode='after')
    def validate_entries(self):
        for group in [self.allow, self.require_approval, self.deny, self.resources_allow, self.resources_deny]:
            if any(not item.strip() or len(item) > 120 for item in group):
                raise ValueError('Policy entries must be nonempty and under 120 characters')
        return self

class AgentCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    purpose: str = Field(min_length=10, max_length=1000)
    owner: str = Field(default='Demo team', min_length=1, max_length=100)
    environment: str = Field(default='Sandbox', max_length=100)
    policy: PolicyData

class ActionRequest(BaseModel):
    agent_id: str
    task: str = Field(min_length=1, max_length=4000)
    tool: str = Field(min_length=1, max_length=120)
    resource: str = Field(min_length=1, max_length=250)
    operation: Literal['READ', 'WRITE', 'EXECUTE', 'DELETE'] = 'READ'
    arguments: dict = Field(default_factory=dict)
    context: dict = Field(default_factory=dict)
    simulated_cost: float = Field(default=0.001, ge=0, le=100000)

class JudgeResult(BaseModel):
    intent_alignment: int = Field(ge=1, le=5)
    authorization_risk: int = Field(ge=1, le=5)
    data_risk: int = Field(ge=1, le=5)
    injection_risk: int = Field(ge=1, le=5)
    privilege_risk: int = Field(default=1, ge=1, le=5)
    necessity: int = Field(ge=1, le=5)
    reversibility_risk: int = Field(default=1, ge=1, le=5)
    recommended_decision: Literal['ALLOW', 'REVIEW', 'BLOCK']
    summary: str

class SettingsData(BaseModel):
    auto_quarantine: bool = True
    blocked_retry_threshold: int = Field(default=3, ge=1, le=10)
    review_threshold: int = Field(default=55, ge=30, le=79)
    critical_threshold: int = Field(default=80, ge=80, le=100)
    alert_channels: list[Literal['Dashboard', 'Email simulation', 'Slack simulation', 'Webhook simulation']] = ['Dashboard', 'Email simulation', 'Slack simulation']
    global_policy_mode: Literal['standard', 'strict'] = 'standard'
