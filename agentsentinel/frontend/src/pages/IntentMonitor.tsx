import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowRight, Crosshair, FlaskConical, RefreshCw } from "lucide-react";
import { api, ago } from "../api/client";
import { Badge, Empty, Panel } from "../components/ui";
import {
  AttackChain,
  FeatureMessage,
  IntentAlertCard,
  IntentCard,
  IntentTimeline,
  RiskTrend,
  WhyPanel,
  pct,
} from "../components/intent";
import type { AgentSessionSummary, IntentAssessment, TimelineItem } from "../types";

interface SessionDetail extends AgentSessionSummary {
  assessment: IntentAssessment | null;
  observed_actions: string[];
}
interface Trend {
  points: { step: number; tool: string; session_risk: number; intent_drift: number | null; action_risk: number }[];
}
interface Comparison {
  normal: IntentAssessment & { sequence: string[]; declared_purpose: string };
  suspicious: IntentAssessment & { sequence: string[]; declared_purpose: string };
}

function ComparisonPanel() {
  const [data, setData] = useState<Comparison | null>(null);
  useEffect(() => {
    api<Comparison>("/api/intent/comparison").then(setData).catch(() => setData(null));
  }, []);
  if (!data) return null;
  const column = (key: "normal" | "suspicious", title: string) => {
    const c = data[key];
    return (
      <div className={`compare-col ${key}`}>
        <span className="eyebrow">{title}</span>
        <div className="compare-seq">
          {c.sequence.map((t, i) => (
            <div key={i}>
              {i > 0 && <ArrowDown size={14} />}
              <code>{t}()</code>
            </div>
          ))}
        </div>
        <dl>
          <dt>Predicted intent</dt>
          <dd>{c.intent_label}</dd>
          <dt>Purpose alignment</dt>
          <dd>{c.purpose_alignment}%</dd>
          <dt>Risk</dt>
          <dd>
            <Badge value={c.risk_level} />
          </dd>
          <dt>Decision</dt>
          <dd>{c.recommended_response}</dd>
        </dl>
      </div>
    );
  };
  return (
    <Panel
      title="Normal versus suspicious session"
      subtitle="Both columns are scored live by the Intent Engine. Nothing here is hard-coded."
    >
      <div className="compare-grid">
        {column("normal", "NORMAL SESSION · CustomerSupportAgent")}
        {column("suspicious", "SUSPICIOUS SESSION · CodingAgent")}
      </div>
    </Panel>
  );
}

function ArchitectureStrip() {
  return (
    <div className="intent-arch" aria-label="Intent engine architecture">
      <div className="intent-arch-row">
        <span>Declared purpose</span>
        <span>User objective</span>
        <span>Session history</span>
        <span>Current action</span>
      </div>
      <ArrowDown size={16} />
      <span className="intent-arch-core">
        <Crosshair size={15} /> Intent Engine
      </span>
      <ArrowDown size={16} />
      <div className="intent-arch-row">
        <span>Predicted objective</span>
        <span>Intent drift</span>
        <span>Possible next step</span>
      </div>
      <ArrowDown size={16} />
      <span className="intent-arch-core risk">Risk Engine · policy stays authoritative</span>
    </div>
  );
}

export default function IntentMonitor({
  initialSession,
  onControl,
  onError,
  onNavigate,
}: {
  initialSession?: string;
  onControl: (id: string, op: string) => void;
  onError: (message: string) => void;
  onNavigate: (page: string) => void;
}) {
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([]),
    [selected, setSelected] = useState(initialSession || ""),
    [detail, setDetail] = useState<SessionDetail | null>(null),
    [timeline, setTimeline] = useState<TimelineItem[]>([]),
    [trend, setTrend] = useState<Trend["points"]>([]),
    [monitoring, setMonitoring] = useState<string[]>([]);

  const loadSessions = useCallback(async () => {
    try {
      const list = await api<AgentSessionSummary[]>("/api/sessions");
      setSessions(list);
      setSelected((current) => current || list.find((s) => s.actions > 0)?.session_id || "");
    } catch (e) {
      onError((e as Error).message);
    }
  }, [onError]);
  const loadSession = useCallback(async () => {
    if (!selected) return;
    try {
      const [d, t, r] = await Promise.all([
        api<SessionDetail>(`/api/sessions/${selected}`),
        api<{ items: TimelineItem[] }>(`/api/sessions/${selected}/timeline`),
        api<Trend>(`/api/sessions/${selected}/risk-trend`),
      ]);
      setDetail(d);
      setTimeline(t.items);
      setTrend(r.points);
    } catch (e) {
      onError((e as Error).message);
    }
  }, [selected, onError]);
  useEffect(() => {
    if (initialSession) setSelected(initialSession);
  }, [initialSession]);
  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);
  useEffect(() => {
    void loadSession();
    const timer = setInterval(() => {
      if (!document.hidden) {
        void loadSession();
        void loadSessions();
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [loadSession, loadSessions]);

  const intent = detail?.assessment;
  const alertWorthy =
    intent && ["HIGH", "CRITICAL"].includes(intent.risk_level) && !monitoring.includes(detail.session_id);

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">INTENT SENTINEL · GUARD THE SESSION, NOT JUST THE TOOL CALL</div>
          <h1>Agent Intent Monitor</h1>
          <p>Understand where an agent’s action sequence appears to be heading.</p>
        </div>
        <button className="secondary" onClick={() => void loadSession()}>
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>
      <FeatureMessage />
      {!sessions.some((s) => s.actions > 0) ? (
        <Panel>
          <Empty
            title="No agent sessions yet"
            text="Run an intent chain in the Red Team Lab. Each action goes through the real gateway and builds a session here."
          />
          <div className="intent-empty-action">
            <button className="primary" onClick={() => onNavigate("redteam")}>
              <FlaskConical size={15} />
              Open the intent chains
              <ArrowRight size={15} />
            </button>
          </div>
        </Panel>
      ) : (
        <div className="intent-layout">
          <aside className="intent-sessions">
            <Panel title="Sessions" subtitle="Newest first">
              <div className="session-list">
                {sessions
                  .filter((s) => s.actions > 0)
                  .map((s) => (
                    <button
                      key={s.session_id}
                      className={`session-item ${s.session_id === selected ? "selected" : ""}`}
                      onClick={() => setSelected(s.session_id)}
                    >
                      <div>
                        <strong>{s.agent_name}</strong>
                        <Badge value={s.status === "ACTIVE" ? "SAFE" : s.status} />
                      </div>
                      <span>{s.intent_prediction}</span>
                      <small>
                        {s.actions} actions · drift {s.intent_drift}% · risk {s.session_risk} · {ago(s.last_updated)}
                      </small>
                    </button>
                  ))}
              </div>
            </Panel>
          </aside>
          <div className="intent-main">
            {detail && intent ? (
              <>
                <div className="session-context">
                  <div>
                    <span>Declared purpose</span>
                    <strong>{detail.declared_purpose}</strong>
                  </div>
                  <div>
                    <span>User objective</span>
                    <strong>{detail.user_objective || "—"}</strong>
                  </div>
                  <div>
                    <span>Session</span>
                    <strong>
                      <code>{detail.session_id}</code> <Badge value={detail.status} />
                    </strong>
                  </div>
                </div>
                {alertWorthy && (
                  <IntentAlertCard
                    intent={intent}
                    agentId={detail.agent_id}
                    agentName={detail.agent_name}
                    purpose={detail.declared_purpose}
                    observed={detail.observed_actions}
                    onControl={(id, op) => {
                      onControl(id, op);
                      setTimeout(() => void loadSession(), 400);
                    }}
                    onContinue={() => setMonitoring((m) => [...m, detail.session_id])}
                  />
                )}
                <IntentCard intent={intent} agentName={detail.agent_name} />
                {intent.attack_chain && intent.attack_chain.stages.length > 0 && (
                  <AttackChain stages={intent.attack_chain.stages} pattern={intent.attack_chain.pattern} />
                )}
                <div className="intent-two">
                  <WhyPanel intent={intent} />
                  <RiskTrend points={trend} />
                </div>
                <IntentTimeline items={timeline} />
                {intent.predicted_next_actions.length > 0 && (
                  <Panel title="Likely next actions" subtitle="Predictions are informational. Sentinel never executes a predicted action.">
                    <div className="next-actions">
                      {intent.predicted_next_actions.map((n) => (
                        <div key={n.tool}>
                          <code>{n.tool}()</code>
                          <span>{n.label}</span>
                          <Badge value={n.risk} />
                          <small>
                            {pct(n.confidence)} confidence · {n.source}
                          </small>
                        </div>
                      ))}
                    </div>
                  </Panel>
                )}
              </>
            ) : (
              <Panel>
                <Empty title="Select a session" text="Choose a session to see its predicted intent and timeline." />
              </Panel>
            )}
          </div>
        </div>
      )}
      <ComparisonPanel />
      <Panel title="How Intent Sentinel fits the gateway" subtitle="Intent is one risk signal. Deterministic policy and observed actions remain authoritative.">
        <ArchitectureStrip />
      </Panel>
      <div className="principle-strip">
        <Crosshair size={16} />
        <span>Do not ask only “is this tool call safe?”</span>
        <span>Also ask what the full sequence appears to be trying to achieve.</span>
      </div>
    </>
  );
}
