import { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Bell,
  Check,
  Download,
  Search,
  ShieldCheck,
  Lock,
} from "lucide-react";
import { Panel, Badge, Empty } from "../components/ui";
import { api, time, ago } from "../api/client";
import type { Agent, Alert, SentinelEvent, Audit } from "../types";
export function LiveMonitor({
  agents,
  events,
  onInspect,
}: {
  agents: Agent[];
  events: SentinelEvent[];
  onInspect: (e: SentinelEvent) => void;
}) {
  const [agent, setAgent] = useState(""),
    [decision, setDecision] = useState(""),
    [severity, setSeverity] = useState(""),
    [tool, setTool] = useState(""),
    [period, setPeriod] = useState("all");
  const filtered = events.filter(
    (e) =>
      (!agent || e.agent_id === agent) &&
      (!decision || e.decision === decision) &&
      (!severity || e.severity === severity) &&
      e.action.tool.includes(tool) &&
      (period === "all" ||
        Date.now() -
          new Date(
            e.timestamp.endsWith("Z") ? e.timestamp : e.timestamp + "Z",
          ).getTime() <
          Number(period) * 60000),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="live-dot" />
            STREAMING EVERY 4 SECONDS
          </div>
          <h1>Live monitor</h1>
          <p>
            Proposed actions and their outcomes, as they pass through the
            gateway.
          </p>
        </div>
        <span className="subtle-tag">
          <Activity size={15} />
          {events.length} recent events
        </span>
      </div>
      <div className="filter-bar">
        <select
          aria-label="Filter agent"
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
        >
          <option value="">All agents</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter decision"
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
        >
          <option value="">All decisions</option>
          {["ALLOW", "REVIEW", "BLOCK"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="Filter severity"
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
        >
          <option value="">All severities</option>
          {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="Filter time"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="all">All recent time</option>
          <option value="5">Last 5 minutes</option>
          <option value="60">Last hour</option>
        </select>
        <div className="search-field">
          <Search size={16} />
          <input
            aria-label="Filter tool"
            placeholder="Search tool…"
            value={tool}
            onChange={(e) => setTool(e.target.value)}
          />
        </div>
      </div>
      <Panel>
        {filtered.length ? (
          <div className="timeline-list">
            {filtered.map((e) => (
              <button
                key={e.id}
                className={`timeline-row ${e.decision.toLowerCase()}`}
                onClick={() => onInspect(e)}
              >
                <time>{time(e.timestamp)}</time>
                <span className="timeline-dot" />
                <div>
                  <strong>{e.agent_name}</strong>
                  <p>
                    <code>{e.action.tool}()</code>
                    <span>→ {e.action.resource}</span>
                  </p>
                  {e.quarantine_state === "QUARANTINED" && (
                    <small className="text-red">
                      Agent quarantined · session revoked
                    </small>
                  )}
                </div>
                <Badge value={e.decision} />
                <span className="muted">Risk {e.risk_score}</span>
                <ArrowUpRight size={17} />
              </button>
            ))}
          </div>
        ) : (
          <Empty title="No matching activity" />
        )}
      </Panel>
    </>
  );
}
export function Alerts({
  alerts,
  onInspect,
  onAcknowledge,
  onControl,
}: {
  alerts: Alert[];
  onInspect: (id: string) => void;
  onAcknowledge: (id: string) => void;
  onControl: (id: string, operation: string) => void;
}) {
  const [filter, setFilter] = useState("open");
  const items = alerts.filter((a) => filter === "all" || !a.acknowledged);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">INVESTIGATE · ACKNOWLEDGE · RESPOND</div>
          <h1>Alert center</h1>
          <p>Evidence for the people responsible for agent safety.</p>
        </div>
        <div className="segmented">
          {["open", "all"].map((s) => (
            <button
              key={s}
              className={filter === s ? "selected" : ""}
              onClick={() => setFilter(s)}
            >
              {s === "open" ? "Open alerts" : "All alerts"}
            </button>
          ))}
        </div>
      </div>
      <div className="alerts-grid">
        {items.length ? (
          items.map((a) => (
            <Panel key={a.id}>
              <div className="alert-card-top">
                <Badge value={a.severity} />
                <small>{ago(a.timestamp)}</small>
              </div>
              <h3>
                <Bell size={20} />
                {a.agent}
              </h3>
              <div className="alert-attempt">
                <label>ATTEMPTED ACTION</label>
                <code>
                  {a.tool}({a.resource})
                </code>
              </div>
              <p>{a.reasons[0]}</p>
              <div className="alert-response">
                <span>
                  Risk <strong>{a.risk_score}/100</strong>
                </span>
                <Badge value={a.response} />
              </div>
              <div className="notification-channels">
                {a.channels.map((c) => (
                  <span key={c}>
                    <Check size={12} />
                    {c}
                  </span>
                ))}
              </div>
              <div className="alert-actions">
                <button
                  className="primary"
                  onClick={() => onInspect(a.event_id)}
                >
                  Investigate
                  <ArrowUpRight size={14} />
                </button>
                <button
                  className="secondary"
                  disabled={a.acknowledged}
                  onClick={() => onAcknowledge(a.id)}
                >
                  {a.acknowledged ? "Acknowledged" : "Acknowledge"}
                </button>
                <button
                  className="secondary"
                  onClick={() => onControl(a.agent_id, "quarantine")}
                >
                  <Lock size={14} />
                  Keep quarantined
                </button>
                <button
                  className="link-btn"
                  onClick={() => onControl(a.agent_id, "resume")}
                >
                  Restore agent
                </button>
              </div>
            </Panel>
          ))
        ) : (
          <Panel>
            <Empty
              title="No open alerts"
              text="Review and block decisions appear here with evidence and simulated notifications."
            />
          </Panel>
        )}
      </div>
    </>
  );
}
export function AuditTrail({
  agents,
  onError,
}: {
  agents: Agent[];
  onError: (message: string) => void;
}) {
  const [rows, setRows] = useState<Audit[]>([]),
    [agent, setAgent] = useState(""),
    [valid, setValid] = useState<string>(""),
    [kind, setKind] = useState("");
  useEffect(() => {
    api<Audit[]>(`/api/audit${agent ? "?agent_id=" + agent : ""}`)
      .then(setRows)
      .catch((e) => onError(e.message));
  }, [agent, onError]);
  async function verify() {
    try {
      const result = await api<{ valid: boolean; checked: number }>(
        "/api/audit/verify",
      );
      setValid(
        `${result.valid ? "Verified" : "Integrity error"} · ${result.checked} records checked`,
      );
    } catch (e) {
      onError((e as Error).message);
    }
  }
  async function download(format: string) {
    try {
      const response = await fetch(
        `/api/audit?format=${format}${agent ? "&agent_id=" + agent : ""}`,
      );
      if (!response.ok) throw new Error("Audit export failed");
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `agentsentinel-audit.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      onError((e as Error).message);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TRACEABLE EVIDENCE</div>
          <h1>Audit trail</h1>
          <p>
            A hash-linked record of decisions, containment, policy changes and
            human actions.
          </p>
        </div>
        <div className="button-row">
          <button className="secondary" onClick={verify}>
            <ShieldCheck size={16} />
            Verify chain
          </button>
          {["json", "csv"].map((f) => (
            <button className="secondary" key={f} onClick={() => download(f)}>
              <Download size={16} />
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {valid && (
        <div className="info-callout">
          <ShieldCheck size={20} />
          {valid}
        </div>
      )}
      <div className="filter-bar">
        <select
          aria-label="Audit agent filter"
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
        >
          <option value="">All agents</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Audit type filter"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="">All evidence types</option>
          {[...new Set(rows.map((r) => r.kind))].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
        <span className="muted">{rows.length} records loaded</span>
      </div>
      <Panel>
        {rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Evidence type</th>
                  <th>Agent</th>
                  <th>Decision / action</th>
                  <th>Risk</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((r) => !kind || r.kind === kind)
                  .map((r) => (
                    <tr key={r.id}>
                      <td>{time(r.timestamp)}</td>
                      <td>{r.kind.replaceAll("_", " ")}</td>
                      <td>
                        {agents.find((a) => a.id === r.agent_id)?.name ||
                          "System"}
                      </td>
                      <td>
                        {r.decision ? (
                          <Badge value={r.decision} />
                        ) : (
                          r.admin_action || "Notification simulated"
                        )}
                      </td>
                      <td>{r.final_risk ?? "—"}</td>
                      <td>
                        <details>
                          <summary>View record</summary>
                          <pre>{JSON.stringify(r, null, 2)}</pre>
                        </details>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No evidence yet" />
        )}
      </Panel>
      <p className="footnote">
        POC integrity: API records are append-only and hash-linked. This is
        tamper-evident, not a substitute for production immutable storage.
      </p>
    </>
  );
}
