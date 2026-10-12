import { useState } from "react";
import { Plus, Bot, Pause, Play, Lock, Power, ShieldCheck } from "lucide-react";
import { Panel, Badge, RiskBar, Modal } from "../components/ui";
import { post } from "../api/client";
import type { Agent, Policy } from "../types";
export default function Agents({
  agents,
  onControl,
  onRefresh,
  onError,
}: {
  agents: Agent[];
  onControl: (id: string, operation: string) => void;
  onRefresh: () => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const list = (key: string) =>
      String(form.get(key) || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    const policy: Policy = {
      allow: list("allow"),
      require_approval: list("require_approval"),
      deny: list("deny"),
      resources_allow: list("resources_allow"),
      resources_deny: list("resources_deny"),
      network_destinations: list("network_destinations"),
      rate_limit: Number(form.get("rate_limit")),
      cost_limit: Number(form.get("cost_limit")),
      risk_sensitivity: form.get(
        "risk_sensitivity",
      ) as Policy["risk_sensitivity"],
    };
    setBusy(true);
    try {
      await post("/api/agents", {
        name: form.get("name"),
        purpose: form.get("purpose"),
        owner: form.get("owner"),
        environment: form.get("environment"),
        policy,
      });
      setOpen(false);
      onRefresh();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">REGISTER INTENT · ENFORCE BOUNDARIES</div>
          <h1>Agent registry</h1>
          <p>
            Each agent has a declared purpose, a permission boundary and a
            revocable session.
          </p>
        </div>
        <button className="primary" onClick={() => setOpen(true)}>
          <Plus size={17} />
          Register agent
        </button>
      </div>
      <div className="agent-cards">
        {agents.map((a) => (
          <Panel key={a.id}>
            <div className="agent-card-head">
              <span className="agent-icon">
                <Bot size={23} />
              </span>
              <Badge value={a.status} />
            </div>
            <h3>{a.name}</h3>
            <p>{a.purpose}</p>
            <div className="agent-meta">
              <span>{a.owner}</span>
              <span>{a.environment}</span>
            </div>
            <RiskBar score={a.risk_score} />
            <div className="permission-block">
              <label>ALLOWED</label>
              <div className="mini-tags">
                {a.policy.allow.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
              <label>HUMAN APPROVAL</label>
              <div className="mini-tags amber">
                {a.policy.require_approval.length ? (
                  a.policy.require_approval.map((t) => <span key={t}>{t}</span>)
                ) : (
                  <small>None</small>
                )}
              </div>
              <label>DENIED</label>
              <div className="mini-tags red">
                {a.policy.deny.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            </div>
            <div className="agent-controls">
              <button
                className="secondary"
                disabled={
                  a.status === "PAUSED" ||
                  a.status === "DISABLED" ||
                  a.status === "QUARANTINED"
                }
                onClick={() => onControl(a.id, "pause")}
              >
                <Pause size={14} />
                Pause
              </button>
              <button
                className="secondary"
                disabled={a.status === "RUNNING"}
                onClick={() => onControl(a.id, "resume")}
              >
                <Play size={14} />
                Restore
              </button>
              <button
                className="secondary"
                disabled={a.status === "QUARANTINED" || a.status === "DISABLED"}
                onClick={() => onControl(a.id, "quarantine")}
              >
                <Lock size={14} />
                Quarantine
              </button>
              <button
                className="danger-quiet"
                disabled={a.status === "DISABLED"}
                onClick={() => onControl(a.id, "kill")}
              >
                <Power size={14} />
                Kill
              </button>
            </div>
          </Panel>
        ))}
      </div>
      <div className="info-callout">
        <ShieldCheck size={22} />
        <p>
          Pause, quarantine and kill apply to synthetic sessions. Restore
          creates a new demo token. The gateway checks state on every request.
        </p>
      </div>
      {open && (
        <Modal title="Register an agent" onClose={() => setOpen(false)} wide>
          <form onSubmit={create} className="form-grid">
            <label>
              Name
              <input
                name="name"
                required
                minLength={2}
                placeholder="DocumentReviewAgent"
              />
            </label>
            <label>
              Owner
              <input name="owner" required defaultValue="Demo team" />
            </label>
            <label className="span-2">
              Declared purpose
              <textarea
                name="purpose"
                required
                minLength={10}
                placeholder="Read synthetic documents and produce internal summaries."
              />
            </label>
            <label>
              Environment
              <input name="environment" defaultValue="Sandbox" required />
            </label>
            <label>
              Risk sensitivity
              <select name="risk_sensitivity">
                <option value="standard">Standard</option>
                <option value="strict">Strict</option>
              </select>
            </label>
            {[
              ["allow", "Allowed tools", "read_public_doc, summarize"],
              ["require_approval", "Approval-required tools", ""],
              ["deny", "Denied tools", "execute_shell, read_secret"],
              ["resources_allow", "Allowed resources", "public_docs"],
              ["resources_deny", "Denied resources", "production_secrets, iam"],
              ["network_destinations", "Network destinations", "internal.demo"],
            ].map(([name, label, value]) => (
              <label key={name}>
                {label}
                <input name={name} defaultValue={value} />
                <small>Comma-separated entries</small>
              </label>
            ))}
            <label>
              Rate limit / minute
              <input
                name="rate_limit"
                type="number"
                min={1}
                max={1000}
                defaultValue={20}
                required
              />
            </label>
            <label>
              Cost budget / minute ($)
              <input
                name="cost_limit"
                type="number"
                min={0.01}
                max={10000}
                step={0.01}
                defaultValue={5}
                required
              />
            </label>
            <div className="form-footer span-2">
              <p>Unknown tools and resources are denied by default.</p>
              <button className="primary" disabled={busy}>
                {busy ? "Registering…" : "Register with policy"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
