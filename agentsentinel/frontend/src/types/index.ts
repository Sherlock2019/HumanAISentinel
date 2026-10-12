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
