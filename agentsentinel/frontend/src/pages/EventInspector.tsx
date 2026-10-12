import { useEffect, useState } from "react";
import {
  ArrowRight,
  ShieldAlert,
  CheckCircle2,
  Lock,
  Bell,
  FileCheck2,
  Brain,
  Activity,
  UserCheck,
  ClipboardCheck,
} from "lucide-react";
import { Panel, Badge, Empty, RiskBar } from "../components/ui";
import type { SentinelEvent } from "../types";
import { time } from "../api/client";
export default function EventInspector({
  event: e,
  events,
  onSelect,
  onReview,
  onCapabilities,
}: {
  event: SentinelEvent | null;
  events: SentinelEvent[];
  onSelect: (e: SentinelEvent) => void;
  onReview: (id: string, choice: string) => void;
  onCapabilities: () => void;
}) {
  const [technical, setTechnical] = useState(false);
  useEffect(() => setTechnical(false), [e?.id]);
  if (!e)
    return (
      <>
        <div className="page-heading">
          <div>
            <h1>Event inspector</h1>
            <p>
              Understand every decision, from declared purpose to containment.
            </p>
          </div>
        </div>
        <Panel>
          <Empty title="Select an action to investigate" />
        </Panel>
      </>
    );
  const unsafe = e.decision === "BLOCK";
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">DECISION EVIDENCE · {time(e.timestamp)}</div>
          <h1>
            {unsafe
              ? "Why was this action blocked?"
              : e.decision === "REVIEW"
                ? "Why does this action need approval?"
                : "Why was this action allowed?"}
          </h1>
          <p>
            Follow the evidence. See exactly where the action crossed a
            boundary.
          </p>
        </div>
        <select
          aria-label="Select event"
          value={e.id}
          onChange={(v) => {
            const item = events.find((x) => x.id === v.target.value);
            if (item) onSelect(item);
          }}
        >
          {events.map((v) => (
            <option key={v.id} value={v.id}>
              {v.agent_name} · {v.action.tool} · {v.decision}
            </option>
          ))}
        </select>
      </div>
      <div className={`decision-banner ${e.decision.toLowerCase()}`}>
        <ShieldAlert size={32} />
        <div>
          <h2>
            {unsafe
              ? "Prevented before execution"
              : e.review_status === "APPROVED"
                ? "Human approved — synthetic action executed"
                : e.review_status === "REJECTED" ||
                    e.review_status === "CANCELLED"
                  ? "Request closed without execution"
                  : e.decision === "REVIEW"
                    ? "Held for a human decision"
                    : "Authorized and executed safely"}
          </h2>
          <p>
            {e.executed
              ? "A synthetic tool receipt was created."
              : "The requested tool did not execute."}{" "}
            {e.quarantine_state === "QUARANTINED"
              ? "The agent’s session was revoked."
              : ""}
          </p>
        </div>
        <div className="big-risk">
          <strong>
            {e.risk_score}
            <small>/100</small>
          </strong>
          <Badge value={e.decision} />
        </div>
      </div>
      <div className="inspector-grid">
        <Panel
          title="01 · Context"
          subtitle="What the agent was supposed to do"
        >
          <div className="inspector-content">
            <label>AGENT</label>
            <h3>{e.agent_name}</h3>
            <label>DECLARED PURPOSE</label>
            <p>{e.agent_purpose}</p>
            <label>ORIGINAL USER REQUEST</label>
            <blockquote>“{e.action.task}”</blockquote>
            <label>RECENT ACTIONS</label>
            {e.behavior.history.length ? (
              <div className="history-list">
                {e.behavior.history.slice(0, 5).map((h, i) => (
                  <div key={i}>
                    <code>{h.tool}</code>
                    <Badge value={h.decision} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">
                No preceding activity in the 60-second window.
              </p>
            )}
            <div className="context-note">
              <Lock size={17} />
              <span>The task does not change the agent’s permissions.</span>
            </div>
          </div>
        </Panel>
        <Panel
          title="02 · Attempted action"
          subtitle="What the agent actually requested"
        >
          <div className="inspector-content">
            <label>REQUESTED TOOL</label>
            <div className={`tool-call ${unsafe ? "unsafe" : ""}`}>
              <code>{e.action.tool}()</code>
            </div>
            <label>TARGET RESOURCE</label>
            <p className="resource-name">{e.action.resource}</p>
            <label>OPERATION</label>
            <span className="subtle-tag">{e.action.operation}</span>
            <label>ARGUMENTS</label>
            {technical ? (
              <pre>{JSON.stringify(e.action.arguments, null, 2)}</pre>
            ) : (
              <p>
                {Object.keys(e.action.arguments).length
                  ? `Additional inputs: ${Object.keys(e.action.arguments).join(", ")}. Use Show technical evidence to inspect the payload.`
                  : "No additional arguments were submitted."}
              </p>
            )}
            {Object.keys(e.action.context).length > 0 && (
              <>
                <label>UNTRUSTED CONTEXT</label>
                {technical ? (
                  <pre>{JSON.stringify(e.action.context, null, 2)}</pre>
                ) : (
                  <p>
                    Untrusted task content was included and evaluated for prompt
                    injection.
                  </p>
                )}
              </>
            )}
            <div className="execution-proof">
              <ClipboardCheck size={20} />
              <div>
                <strong>
                  {e.executed
                    ? "Synthetic receipt available"
                    : "No execution receipt"}
                </strong>
                <p>
                  {e.executed
                    ? "The gateway authorized the sandbox tool."
                    : "Sentinel held this call at the execution boundary."}
                </p>
              </div>
            </div>
          </div>
        </Panel>
        <Panel
          title="03 · Sentinel decision"
          subtitle="Independent signals, one enforced outcome"
        >
          <div className="inspector-content">
            <h4>
              <FileCheck2 size={16} />
              POLICY ENGINE
            </h4>
            {[
              ["Tool authorized", e.policy_result.tool_allowed],
              ["Resource authorized", e.policy_result.resource_allowed],
              ["Purpose aligned", e.llm_result.intent_alignment >= 4],
            ].map(([label, pass]) => (
              <div className="check-row" key={String(label)}>
                <span>{String(label)}</span>
                <strong className={pass ? "text-green" : "text-red"}>
                  {pass ? "PASS" : "FAIL"}
                </strong>
              </div>
            ))}
            <h4>
              <Brain size={16} />
              SAFETY JUDGE <small>{e.llm_result.provider.toUpperCase()}</small>
            </h4>
            {technical &&
              [
                ["Intent alignment", e.llm_result.intent_alignment],
                ["Authorization risk", e.llm_result.authorization_risk],
                ["Data exposure risk", e.llm_result.data_risk],
                ["Injection risk", e.llm_result.injection_risk],
                ["Privilege risk", e.llm_result.privilege_risk],
              ].map(([label, score]) => (
                <div className="check-row" key={String(label)}>
                  <span>{label}</span>
                  <strong>{score}/5</strong>
                </div>
              ))}
            <p className="judge-summary">{e.llm_result.summary}</p>
            <h4>
              <Activity size={16} />
              BEHAVIOR MONITOR
            </h4>
            {technical && <RiskBar score={e.behavior.score} />}
            <p className="muted">
              {e.behavior.reasons.join(" ") ||
                "Activity matches the registered baseline."}
            </p>
            {technical && (
              <>
                <label>RISK FORMULA</label>
                <p className="muted">{e.risk.formula}</p>
                <pre>{JSON.stringify(e.risk.components, null, 2)}</pre>
              </>
            )}
          </div>
        </Panel>
      </div>
      <Panel
        title="The decision, in plain English"
        subtitle="Every finding connects the attempted action to its consequence."
      >
        <div className="reasons-list">
          {e.reasons.map((reason, i) => (
            <div key={i}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <p>{reason}</p>
            </div>
          ))}
        </div>
        <div className="response-strip">
          <span>
            <CheckCircle2 size={18} />
            {e.executed
              ? "Tool executed in sandbox"
              : "Tool execution prevented"}
          </span>
          <span>
            <Lock size={18} />
            {e.quarantine_state === "QUARANTINED"
              ? "Agent quarantined"
              : `Agent ${e.quarantine_state.toLowerCase()}`}
          </span>
          <span>
            <Bell size={18} />
            {e.decision === "ALLOW"
              ? "Audit evidence preserved"
              : "Admin notification simulated"}
          </span>
        </div>
        {e.review_status === "PENDING" && (
          <div className="approval-box">
            <UserCheck size={23} />
            <div>
              <h3>Your decision is required</h3>
              <p>
                Approval rechecks current policy and state. A deny cannot be
                overridden.
              </p>
            </div>
            <button
              className="secondary"
              onClick={() => onReview(e.id, "REJECT")}
            >
              Reject request
            </button>
            <button
              className="primary"
              onClick={() => onReview(e.id, "APPROVE")}
            >
              Approve synthetic action
            </button>
          </div>
        )}
        {e.review_status && e.review_status !== "PENDING" && (
          <div className="review-outcome">
            Human review: <Badge value={e.review_status} />
          </div>
        )}
        {e.capability.dangerous && (
          <button className="secondary" onClick={onCapabilities}>
            Explore the dangerous capability path
            <ArrowRight size={16} />
          </button>
        )}
      </Panel>
      <div className="evidence-toggle">
        <button
          className="secondary"
          aria-expanded={technical}
          aria-controls="technical-evidence"
          onClick={() => setTechnical(!technical)}
        >
          <ClipboardCheck size={16} />
          {technical ? "Hide technical evidence" : "Show technical evidence"}
        </button>
        <span>Optional: evaluator scores, risk formula and raw JSON.</span>
      </div>
      {technical && (
        <div id="technical-evidence">
          <Panel
            title="Technical evidence"
            subtitle={`Request ${e.request_id} · Evaluation ${e.timing_ms} ms`}
          >
            <details>
              <summary>Raw action and evaluator JSON</summary>
              <pre className="raw-json">{JSON.stringify(e, null, 2)}</pre>
            </details>
          </Panel>
        </div>
      )}
    </>
  );
}
