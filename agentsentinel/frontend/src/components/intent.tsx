import { useEffect, useState } from "react";
import { ReactFlow, Background, MarkerType, Position } from "@xyflow/react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  CheckCircle2,
  Crosshair,
  Eye,
  Lock,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  SkipForward,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { api, post, time } from "../api/client";
import { Badge, Panel } from "./ui";
import type {
  ChainStage,
  IntentAssessment,
  IntentScenario,
  NextAction,
  SentinelEvent,
  TimelineItem,
} from "../types";
import "./intent.css";

export const pct = (v: number) => `${Math.round(v * 100)}%`;
const RISK_STAGE: Record<string, "green" | "amber" | "red"> = {
  Reconnaissance: "green",
  "Normal Activity": "green",
  "Configuration Discovery": "amber",
  "Identity Discovery": "amber",
  "Permission Enumeration": "amber",
  "Action Denied": "amber",
  "Credential Discovery": "red",
};
const stageColor = (label: string) => RISK_STAGE[label] || "red";
const COLORS = { green: "#259b81", amber: "#d08a12", red: "#d44350" };

export function FeatureMessage() {
  return (
    <div className="intent-message">
      <div>
        <span className="eyebrow">INTENT SENTINEL</span>
        <h2>
          One tool call may look harmless.
          <br />
          The sequence may not.
        </h2>
      </div>
      <div className="intent-message-list">
        <span>AgentSentinel evaluates:</span>
        <ol>
          <li>What the agent was asked to do</li>
          <li>What it has already done</li>
          <li>What it is trying to do now</li>
          <li>What it may try next</li>
        </ol>
      </div>
    </div>
  );
}

function Meter({ label, value, invert = false, neutral = false }: { label: string; value: number; invert?: boolean; neutral?: boolean }) {
  const bad = invert ? 100 - value : value;
  // Confidence is not a risk: high confidence in a normal workflow is good news.
  const color = neutral ? "#347bc7" : bad >= 70 ? COLORS.red : bad >= 40 ? COLORS.amber : COLORS.green;
  return (
    <div className="intent-meter">
      <span>{label}</span>
      <strong style={{ color }}>
        {value}
        <small>{label === "Session risk" ? "/100" : "%"}</small>
      </strong>
      <div className="intent-meter-track">
        <i style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

export function IntentCard({ intent, agentName }: { intent: IntentAssessment; agentName?: string }) {
  const next = intent.predicted_next_actions[0];
  const danger = ["HIGH", "CRITICAL"].includes(intent.risk_level);
  return (
    <section className={`intent-card ${danger ? "is-danger" : intent.risk_level === "MEDIUM" ? "is-watch" : "is-safe"}`}>
      <div className="intent-card-main">
        <span className="eyebrow">PREDICTED INTENT{agentName ? ` · ${agentName}` : ""}</span>
        <h2>{intent.intent_label}</h2>
        <div className="intent-tags">
          {intent.categories.map((c) => (
            <code key={c}>{c}</code>
          ))}
          <Badge value={intent.risk_level} />
          {intent.drift_alert && <span className="intent-drift-flag">{intent.drift_alert}</span>}
        </div>
        <p className="intent-caveat">
          Likely objective inferred from observable behavior. Not a statement of the agent’s hidden intent.
        </p>
      </div>
      <div className="intent-card-metrics">
        <Meter label="Confidence" value={Math.round(intent.confidence * 100)} neutral />
        <Meter label="Purpose alignment" value={intent.purpose_alignment} invert />
        <Meter label="Intent drift" value={intent.intent_drift} />
        <Meter label="Session risk" value={intent.session_risk} />
      </div>
      <div className="intent-card-foot">
        <div>
          <span>Likely next step</span>
          {next ? (
            <strong>
              {next.label} <code>{next.tool}()</code>
              <small>
                {" "}
                · {pct(next.confidence)} confidence · prediction, not observed
              </small>
            </strong>
          ) : (
            <strong className="muted">No escalation predicted</strong>
          )}
        </div>
        <div>
          <span>Decision</span>
          <strong className={`intent-decision ${intent.enforcement.toLowerCase()}`}>{intent.recommended_response}</strong>
        </div>
      </div>
    </section>
  );
}

export function WhyPanel({ intent }: { intent: IntentAssessment }) {
  const lines = intent.reasoning_summary.split("\n");
  return (
    <Panel title="Why Sentinel thinks this" subtitle="A concise summary of observed evidence. No model reasoning transcript is stored.">
      <div className="intent-why">
        {lines.map((line, i) => (
          <p key={i} className={/^\d+\./.test(line) ? "step" : i === lines.length - 1 ? "conclusion" : ""}>
            {line}
          </p>
        ))}
        {intent.rule_hits.length > 0 && (
          <div className="intent-rules">
            <span>Deterministic signals</span>
            {intent.rule_hits.map((h) => (
              <div key={h.rule}>
                <code>{h.rule}</code>
                <Badge value={h.risk} />
                <small>{h.explanation}</small>
              </div>
            ))}
          </div>
        )}
        <small className="muted">
          Evaluator: {intent.evaluator.provider}
          {intent.evaluator.model_version ? ` (${intent.evaluator.model_version})` : ""}
          {intent.evaluator.note ? ` · ${intent.evaluator.note}` : ""} · Predictive blocking{" "}
          {intent.predictive_blocking ? "ON" : "OFF"}
        </small>
      </div>
    </Panel>
  );
}

export function AttackChain({ stages, pattern }: { stages: ChainStage[]; pattern: string }) {
  const visible = stages.filter((s) => s.status !== "skipped");
  const firstPredicted = visible.findIndex((s) => s.status === "predicted");
  const nodes = visible.map((s, i) => {
    const color = COLORS[stageColor(s.label)];
    const predicted = s.status === "predicted";
    return {
      id: String(i),
      position: { x: i * 205, y: 0 },
      data: {
        label: (
          <div className="chain-node">
            <strong>{s.label}</strong>
            <code>{s.tool ? `${s.tool}()` : "alternate tool"}</code>
            <span>{predicted ? "Predicted" : "Observed"}</span>
          </div>
        ),
      },
      style: {
        width: 175,
        borderRadius: 10,
        border: `2px ${predicted ? "dashed" : "solid"} ${color}`,
        background: predicted ? "#fbfcfd" : `${color}14`,
        opacity: predicted ? 0.78 : 1,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });
  const edges = visible.slice(1).map((s, i) => {
    const predicted = s.status === "predicted";
    const color = predicted ? "#8a96a4" : COLORS[stageColor(s.label)];
    return {
      id: `e${i}`,
      source: String(i),
      target: String(i + 1),
      animated: !predicted,
      label: predicted && i + 1 === firstPredicted ? "PREDICTED PATH — NOT YET OBSERVED" : undefined,
      labelStyle: { fill: "#6b7785", fontSize: 9, fontWeight: 700 },
      style: { stroke: color, strokeWidth: 2, strokeDasharray: predicted ? "6 5" : undefined },
      markerEnd: { type: MarkerType.ArrowClosed, color },
    };
  });
  return (
    <Panel
      title="Attack chain"
      subtitle={`Pattern ${pattern.replaceAll("_", " ").toLowerCase()} · solid: observed · dashed: predicted, not yet observed`}
      action={
        <div className="chain-legend">
          <i className="green" />
          normal
          <i className="amber" />
          suspicious
          <i className="red" />
          dangerous
        </div>
      }
    >
      <div className="chain-flow">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          nodesDraggable={false}
          nodesConnectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={22} color="#e8edf1" />
        </ReactFlow>
      </div>
    </Panel>
  );
}

const STATUS_ICON: Record<string, typeof CheckCircle2> = {
  ALLOWED: CheckCircle2,
  WATCH: Eye,
  REVIEW: TriangleAlert,
  "HIGH RISK": TriangleAlert,
  BLOCKED: XCircle,
};

export function IntentTimeline({ items }: { items: TimelineItem[] }) {
  return (
    <Panel title="Session timeline" subtitle="Every action, its decision, and how the predicted intent changed after it.">
      <ol className="intent-timeline">
        {items.map((item, i) =>
          item.type === "state" ? (
            <li key={i} className="state">
              <time>{time(item.timestamp)}</time>
              <Lock size={16} />
              <div>
                <strong>AGENT {item.state}</strong>
                <small>{item.reason}</small>
              </div>
            </li>
          ) : (
            <li key={i} className={item.status.toLowerCase().replace(" ", "-")}>
              <time>{time(item.timestamp)}</time>
              {(() => {
                const Icon = STATUS_ICON[item.status] || CheckCircle2;
                return <Icon size={16} />;
              })()}
              <div>
                <strong>
                  <code>{item.tool}()</code> <span className="muted">· {item.resource}</span>
                </strong>
                <small>{item.description}</small>
                {item.prediction && (
                  <small className="intent-after">
                    Predicted intent: <b>{item.prediction.intent_label}</b> · drift {item.prediction.intent_drift}% ·
                    session risk {item.session_risk}
                  </small>
                )}
              </div>
              <span className={`timeline-status ${item.status.toLowerCase().replace(" ", "-")}`}>
                {item.status === "ALLOWED" ? "✓ " : item.status === "BLOCKED" ? "✕ " : "⚠ "}
                {item.status}
              </span>
            </li>
          ),
        )}
      </ol>
    </Panel>
  );
}

export function RiskTrend({
  points,
}: {
  points: { step: number; tool: string; session_risk: number; intent_drift: number | null; action_risk: number }[];
}) {
  return (
    <Panel title="Session risk trend" subtitle="Risk accumulates across the session and decays when the agent returns to normal work.">
      <div className="intent-trend">
        <ResponsiveContainer width="100%" height={230}>
          <LineChart data={points} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e9edf1" />
            <XAxis dataKey="tool" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip />
            <ReferenceLine y={80} stroke="#d44350" strokeDasharray="4 4" label={{ value: "critical", fontSize: 9, fill: "#d44350" }} />
            <ReferenceLine y={55} stroke="#d08a12" strokeDasharray="4 4" label={{ value: "review", fontSize: 9, fill: "#d08a12" }} />
            <Line type="monotone" dataKey="session_risk" name="Session risk" stroke="#d44350" strokeWidth={2.5} dot />
            <Line type="monotone" dataKey="intent_drift" name="Intent drift" stroke="#347bc7" strokeWidth={2} dot />
            <Line type="monotone" dataKey="action_risk" name="Per-call risk" stroke="#9aa6b2" strokeDasharray="4 3" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

export function IntentAlertCard({
  intent,
  agentId,
  agentName,
  purpose,
  observed,
  onControl,
  onContinue,
}: {
  intent: IntentAssessment;
  agentId: string;
  agentName: string;
  purpose: string;
  observed: string[];
  onControl: (id: string, op: string) => void;
  onContinue: () => void;
}) {
  const next: NextAction | undefined = intent.predicted_next_actions[0];
  return (
    <section className="intent-alert" role="alert">
      <div className="intent-alert-head">
        <ShieldAlert size={24} />
        <div>
          <span className="eyebrow">HIGH-RISK INTENT PREDICTED</span>
          <h3>{intent.intent_label}</h3>
        </div>
        <Badge value={intent.risk_level} />
      </div>
      <dl>
        <dt>Agent</dt>
        <dd>{agentName}</dd>
        <dt>Declared purpose</dt>
        <dd>{purpose}</dd>
        <dt>Observed actions</dt>
        <dd>
          {observed.map((t, i) => (
            <span key={i}>
              {i > 0 && <ArrowRight size={12} />}
              <code>{t}</code>
            </span>
          ))}
        </dd>
        <dt>Confidence</dt>
        <dd>{pct(intent.confidence)}</dd>
        <dt>Possible next action</dt>
        <dd>{next ? `${next.label} (${next.tool}) — prediction` : "—"}</dd>
        <dt>Recommended response</dt>
        <dd>
          <strong>{intent.recommended_response}</strong>
        </dd>
      </dl>
      <div className="intent-alert-actions">
        <button className="secondary" onClick={onContinue}>
          <Eye size={15} />
          Continue monitoring
        </button>
        <button className="secondary" onClick={() => onControl(agentId, "pause")}>
          <Pause size={15} />
          Pause agent
        </button>
        <button className="danger" onClick={() => onControl(agentId, "quarantine")}>
          <Lock size={15} />
          Quarantine
        </button>
      </div>
    </section>
  );
}

interface StepResult {
  session_id: string;
  step: number;
  total: number;
  done: boolean;
  note: string;
  event: SentinelEvent;
  intent: IntentAssessment;
}

export function IntentChainRunner({
  onRefresh,
  onError,
  onMonitor,
}: {
  onRefresh: () => void;
  onError: (message: string) => void;
  onMonitor: (sessionId: string) => void;
}) {
  const [scenarios, setScenarios] = useState<IntentScenario[]>([]),
    [selected, setSelected] = useState("exfiltration-chain"),
    [rows, setRows] = useState<StepResult[]>([]),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<IntentScenario[]>("/api/redteam/intent-scenarios")
      .then(setScenarios)
      .catch((e) => onError(e.message));
  }, [onError]);
  const scenario = scenarios.find((s) => s.id === selected);
  const last = rows[rows.length - 1];
  const finished = !!last?.done;

  async function runStep(current: StepResult[]): Promise<StepResult[] | null> {
    const step = current.length;
    const r = await post<StepResult>("/api/redteam/intent-step", {
      scenario_id: selected,
      step,
      ...(step ? { session_id: current[0].session_id } : {}),
    });
    return [...current, r];
  }
  async function next() {
    setBusy(true);
    try {
      const updated = await runStep(finished ? [] : rows);
      if (updated) setRows(updated);
      onRefresh();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function runAll() {
    setBusy(true);
    try {
      let current: StepResult[] = finished ? [] : rows;
      while (!current.length || !current[current.length - 1].done) {
        const updated = await runStep(current);
        if (!updated) break;
        current = updated;
        setRows(current);
        await new Promise((resolve) => setTimeout(resolve, 650));
      }
      onRefresh();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel
      title="Intent chains · watch the prediction evolve"
      subtitle="Each chain runs ONE action at a time through the real gateway. Individual actions can look harmless; the sequence reveals the objective."
      action={
        <select
          aria-label="Intent chain"
          value={selected}
          disabled={busy}
          onChange={(e) => {
            setSelected(e.target.value);
            setRows([]);
          }}
        >
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      }
    >
      {scenario && (
        <div className="chain-runner">
          <div className="chain-runner-head">
            <div>
              <span className="eyebrow">{scenario.category}</span>
              <p>{scenario.description}</p>
              <small className="muted">
                Agent <code>{scenario.agent_id}</code> · objective “{scenario.objective}”
              </small>
            </div>
            <div className="chain-runner-buttons">
              <button className="secondary" disabled={busy} onClick={next}>
                {finished ? <RotateCcw size={15} /> : <SkipForward size={15} />}
                {finished ? "Restart chain" : rows.length ? "Next action" : "Run first action"}
              </button>
              <button className="primary" disabled={busy} onClick={runAll}>
                <Play size={15} />
                {busy ? "Running…" : finished ? "Replay all" : "Run all steps"}
              </button>
              {last && (
                <button className="secondary" onClick={() => onMonitor(last.session_id)}>
                  <Crosshair size={15} />
                  Open in Intent Monitor
                </button>
              )}
            </div>
          </div>
          <div className="table-scroll">
            <table className="chain-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Action</th>
                  <th>Predicted intent</th>
                  <th>Confidence</th>
                  <th>Drift</th>
                  <th>Session risk</th>
                  <th>Response</th>
                </tr>
              </thead>
              <tbody>
                {scenario.steps.map((s, i) => {
                  const r = rows[i];
                  return (
                    <tr key={i} className={r ? "" : "pending"}>
                      <td>{i + 1}</td>
                      <td>
                        <code>{s.tool}()</code>
                        {s.note && <small className="muted"> {s.note}</small>}
                      </td>
                      <td>{r ? <strong>{r.intent.intent_label}</strong> : <span className="muted">not run</span>}</td>
                      <td>{r ? pct(r.intent.confidence) : ""}</td>
                      <td>{r ? `${r.intent.intent_drift}%` : ""}</td>
                      <td>{r ? <b className={r.intent.session_risk >= 80 ? "text-red" : ""}>{r.intent.session_risk}</b> : ""}</td>
                      <td>
                        {r && (
                          <span className="chain-response">
                            <Badge value={r.event.decision} />
                            {r.intent.enforcement === "WATCH" && <Badge value="WATCH" />}
                            {r.event.quarantine_state === "QUARANTINED" && <Badge value="QUARANTINED" />}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {last && <IntentCard intent={last.intent} agentName={last.event.agent_name} />}
        </div>
      )}
    </Panel>
  );
}
