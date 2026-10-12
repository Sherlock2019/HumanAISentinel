export interface Policy {
  allow: string[];
  require_approval: string[];
  deny: string[];
  resources_allow: string[];
  resources_deny: string[];
  network_destinations: string[];
  rate_limit: number;
  cost_limit: number;
  risk_sensitivity: "standard" | "strict";
}
export interface Agent {
  id: string;
  name: string;
  purpose: string;
  owner: string;
  environment: string;
  status: string;
  risk_score: number;
  current_task: string;
  last_activity: string;
  blocked: number;
  actions_per_minute: number;
  policy: Policy;
  intent?: AgentIntentSummary | null;
}
export interface AgentIntentSummary {
  session_id: string;
  predicted_intent: string;
  categories: string[];
  confidence: number;
  risk: string;
  drift: number;
  session_risk: number;
  session_status: string;
}
export interface ChainStage {
  label: string;
  status: "observed" | "skipped" | "predicted";
  tool: string | null;
}
export interface NextAction {
  tool: string;
  label: string;
  confidence: number;
  risk: string;
  source: string;
}
export interface RuleHit {
  rule: string;
  categories?: string[];
  risk: string;
  response: string;
  explanation: string;
  confidence?: number;
}
export interface IntentAssessment {
  predicted_intent: string;
  intent_label: string;
  categories: string[];
  primary_category: string;
  confidence: number;
  risk_level: string;
  session_risk: number;
  purpose_alignment: number;
  intent_drift: number;
  drift_alert: string;
  evidence: string[];
  reasoning_summary: string;
  predicted_next_actions: NextAction[];
  recommended_response: string;
  enforcement: string;
  quarantine: boolean;
  deterministic_signal: boolean;
  rule_hits: RuleHit[];
  attack_chain: { pattern: string; match_score: number; stages: ChainStage[] } | null;
  evaluator: { provider: string; available: boolean; model_version: string; note: string };
  predictive_blocking: boolean;
  actions_considered: number;
}
export interface IntentPredictionRecord {
  prediction_id: string;
  sequence_index: number;
  timestamp: string;
  predicted_intent: string;
  intent_label: string;
  categories: string[];
  confidence: number;
  risk_level: string;
  session_risk: number;
  purpose_alignment: number;
  intent_drift: number;
  reasoning_summary: string;
  predicted_next_actions: NextAction[];
  recommended_response: string;
  enforcement: string;
  drift_alert: string;
  attack_chain: IntentAssessment["attack_chain"];
  rule_hits: RuleHit[];
  evaluator_note: string;
  model_provider: string;
  model_version: string;
}
export interface AgentSessionSummary {
  session_id: string;
  agent_id: string;
  agent_name: string;
  agent_status: string | null;
  declared_purpose: string;
  user_objective: string;
  start_time: string;
  status: string;
  intent_prediction: string;
  intent_categories: string[];
  intent_confidence: number;
  intent_risk: string;
  session_risk: number;
  purpose_alignment: number;
  intent_drift: number;
  last_updated: string;
  actions: number;
}
export type TimelineItem =
  | {
      type: "action";
      timestamp: string;
      sequence_index: number;
      tool: string;
      resource: string;
      class: string;
      description: string;
      decision: string;
      status: string;
      risk_score: number;
      session_risk: number;
      event_id: string;
      prediction: IntentPredictionRecord | null;
    }
  | { type: "state"; timestamp: string; state: string; reason: string };
export interface IntentScenario {
  id: string;
  title: string;
  category: string;
  agent_id: string;
  objective: string;
  description: string;
  steps: { tool: string; resource: string; operation: string; note: string }[];
}
export interface Judge {
  intent_alignment: number;
  authorization_risk: number;
  data_risk: number;
  injection_risk: number;
  privilege_risk: number;
  necessity: number;
  summary: string;
  recommended_decision: string;
  provider: string;
  available: boolean;
}
export interface SentinelEvent {
  id: string;
  timestamp: string;
  agent_id: string;
  agent_name: string;
  agent_purpose: string;
  decision: string;
  severity: string;
  risk_score: number;
  review_status: string | null;
  action: {
    task: string;
    tool: string;
    resource: string;
    operation: string;
    arguments: Record<string, unknown>;
    context: Record<string, unknown>;
  };
  policy_result: {
    tool_allowed: boolean;
    resource_allowed: boolean;
    decision: string;
    critical: boolean;
    reasons: string[];
  };
  llm_result: Judge;
  behavior: {
    score: number;
    reasons: string[];
    history: { tool: string; decision: string; resource: string }[];
    actions_per_minute: number;
  };
  capability: { dangerous: boolean; paths: string[][] };
  risk: { components: Record<string, number>; formula: string };
  reasons: string[];
  quarantine_state: string;
  executed: boolean;
  timing_ms: number;
  request_id: string;
  session_id?: string;
  intent?: IntentAssessment;
  tool_result?: {
    receipt: string;
    simulation: boolean;
    tool: string;
    resource: string;
    message: string;
  } | null;
}

export interface CommitExample {
  id: string;
  title: string;
  description: string;
  commit: {
    repository: string;
    sha: string;
    url: string;
    branch: string;
    message: string;
    file: string;
    diff: string;
    fixture: boolean;
    repo_url?: string;
    files?: { filename: string; status: string; patch_available: boolean }[];
    notices?: string[];
    partial?: boolean;
    fetched_at?: string;
  };
  plan: {
    title: string;
    tool: string;
    resource: string;
    operation: string;
    expected: string | null;
  }[];
}

export interface CommitRun {
  id: string;
  timestamp: string;
  simulation: boolean;
  input_source: "github" | "fixture";
  ai_provider: string;
  example_id: string;
  title: string;
  commit: CommitExample["commit"];
  trigger: string;
  workflow_name: string;
  workflow_status: string;
  test_status: string;
  expected_met: boolean | null;
  cursor: number;
  plan: CommitExample["plan"];
  events: SentinelEvent[];
  contained: boolean;
  final_decision: string | null;
  summary: {
    actions: number;
    executed: number;
    blocked: number;
    review: number;
    max_risk: number;
  };
  limitations: string;
}
export interface Alert {
  id: string;
  event_id: string;
  agent_id: string;
  agent: string;
  severity: string;
  timestamp: string;
  acknowledged: boolean;
  tool: string;
  resource: string;
  reasons: string[];
  risk_score: number;
  response: string;
  channels: string[];
}
export interface Metrics {
  total_actions: number;
  allowed: number;
  blocked: number;
  review: number;
  critical_events: number;
  quarantined_agents: number;
  active_agents: number;
  safe_agents: number;
  under_review: number;
  critical_alerts: number;
  average_risk: number;
  health_score: number;
  top_risky_tool: string;
  top_risky_agent: string;
  prompt_injection_detections: number;
  policy_violations: number;
  tool_abuse_attempts: number;
  decisions: { name: string; value: number }[];
  severity: { name: string; value: number }[];
  tools: { name: string; value: number }[];
  ranking: { name: string; risk: number }[];
  timeline: { time: string; actions: number; blocked: number; risk: number }[];
  intent?: {
    high_risk_intent_sessions: number;
    intent_drift_alerts: number;
    predicted_exfiltration: number;
    policy_bypass_attempts: number;
    tracked_sessions: number;
  };
}
export interface Scenario {
  id: string;
  title: string;
  category: string;
  agent_id: string;
  tool: string;
  resource: string;
  task: string;
  expected: string;
  description: string;
}
export interface Settings {
  ai_provider: string;
  auto_quarantine: boolean;
  blocked_retry_threshold: number;
  review_threshold: number;
  critical_threshold: number;
  alert_channels: string[];
  global_policy_mode: string;
  emergency_stopped: boolean;
  simulation_only: boolean;
}
export interface Audit {
  id: string;
  timestamp: string;
  kind: string;
  agent_id?: string;
  event_id?: string;
  decision?: string;
  final_risk?: number;
  hash: string;
  previous_hash: string;
  admin_action?: string;
  [key: string]: unknown;
}
