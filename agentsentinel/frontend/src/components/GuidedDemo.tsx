import { useState } from "react";
import {
  Bot,
  CheckCircle2,
  ArrowRight,
  Play,
  ShieldCheck,
  Lock,
  UserCheck,
  TriangleAlert,
  Network,
} from "lucide-react";
import { Modal, Badge } from "./ui";
import { post } from "../api/client";
import type { SentinelEvent } from "../types";
const steps = [
  {
    title: "Healthy agents, clear boundaries",
    text: "Four agents are registered with distinct purposes and permissions. The gateway is ready to check their next action.",
  },
  {
    title: "A safe support search",
    text: "CustomerSupportAgent searches its approved knowledge base. Purpose, tool and resource align. Sentinel allows execution.",
  },
  {
    title: "A payment needs a person",
    text: "FinanceAgent proposes a synthetic payment request. It is authorized, but requires human approval. The tool stays pending.",
  },
  {
    title: "Code review crosses a boundary",
    text: "CodingAgent tries to read AWS_PRODUCTION_TOKEN. Code review does not require a production credential. Sentinel blocks the tool before execution.",
  },
  {
    title: "Automatic containment and alerts",
    text: "Risk reaches 98/100. The agent is quarantined, its session revoked, pending actions cancelled, and simulated notifications recorded.",
  },
  {
    title: "Inspect the evidence",
    text: "The event inspector connects the original task to the denied tool, semantic findings, behavior anomaly and containment response.",
  },
  {
    title: "Follow the dangerous path",
    text: "The capability map exposes the route from CodingAgent to read_prod_secret and AWS_PRODUCTION_TOKEN. Indirect tool chains are checked too.",
  },
  {
    title: "Keep the agent quarantined",
    text: "The administrator keeps CodingAgent contained. Its future actions remain blocked until a deliberate restore.",
  },
  {
    title: "Demo complete",
    text: "Three proposed actions. Three different safety outcomes. One critical incident contained before execution.",
  },
];
export default function GuidedDemo({
  onClose,
  onRefresh,
  onInspect,
  onMap,
  onError,
}: {
  onClose: () => void;
  onRefresh: () => void;
  onInspect: (e: SentinelEvent) => void;
  onMap: () => void;
  onError: (message: string) => void;
}) {
  const [step, setStep] = useState(0),
    [events, setEvents] = useState<SentinelEvent[]>([]),
    [busy, setBusy] = useState(false),
    [issue, setIssue] = useState("");
  async function next() {
    setIssue("");
    setBusy(true);
    try {
      const target = step + 1;
      if (target === 1) await post("/api/redteam/prepare-demo");
      if (target >= 1 && target <= 3) {
        const r = await post<{ result: SentinelEvent }>("/api/redteam/run", {
          scenario_id:
            target === 1 ? "safe" : target === 2 ? "payment" : "secret",
          reset_agent: true,
        });
        setEvents((list) => [...list, r.result]);
        onRefresh();
      }
      if (target === 5 && events[2]) onInspect(events[2]);
      if (target === 6) onMap();
      if (target === 7) {
        await post("/api/agents/coding-agent/quarantine");
        onRefresh();
      }
      setStep(target);
    } catch (e) {
      setIssue((e as Error).message);
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const e = step === 1 ? events[0] : step === 2 ? events[1] : events[2];
  const Icon =
    step === 0
      ? Bot
      : step === 1
        ? CheckCircle2
        : step === 2
          ? UserCheck
          : step === 6
            ? Network
            : step >= 7
              ? ShieldCheck
              : step === 4
                ? Lock
                : TriangleAlert;
  return (
    <Modal title="The AgentSentinel guided demo" onClose={onClose} wide>
      <div className="demo-progress">
        {steps.map((s, i) => (
          <span key={s.title} className={i <= step ? "done" : ""} />
        ))}
      </div>
      <div className="demo-content">
        {issue && (
          <div className="offline-banner" role="alert">
            {issue}
          </div>
        )}
        <span className="eyebrow">
          STEP {String(step + 1).padStart(2, "0")} OF 09 · ABOUT FIVE MINUTES
        </span>
        <div
          className={`demo-icon ${step === 3 || step === 4 ? "danger" : ""}`}
        >
          <Icon size={37} />
        </div>
        <h2>{steps[step].title}</h2>
        <p>{steps[step].text}</p>
        {step === 0 && (
          <p className="footnote">
            Starting the demo restores the four sandbox agents and resets their
            behavior window. Existing evidence is preserved.
          </p>
        )}
        {e && step > 0 && step < 8 && (
          <div className="demo-evidence">
            <div>
              <label>AGENT</label>
              <strong>{e.agent_name}</strong>
            </div>
            <div>
              <label>PROPOSED TOOL</label>
              <code>{e.action.tool}()</code>
            </div>
            <div>
              <label>DECISION</label>
              <Badge value={e.decision} />
            </div>
            <div>
              <label>RISK</label>
              <strong>{e.risk_score}/100</strong>
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="demo-mismatch">
            <span>Intended: review application source</span>
            <ArrowRight size={18} />
            <span className="text-red">Attempted: read production secret</span>
          </div>
        )}
        {step === 4 && (
          <div className="response-strip">
            <span>
              <CheckCircle2 size={17} />
              Tool stopped
            </span>
            <span>
              <Lock size={17} />
              Session revoked
            </span>
            <span>
              <ShieldCheck size={17} />
              Evidence preserved
            </span>
          </div>
        )}
        {step === 5 && (
          <div className="demo-findings">
            {events[2]?.reasons.slice(0, 4).map((r, i) => (
              <p key={i}>
                <span>{i + 1}</span>
                {r}
              </p>
            ))}
          </div>
        )}
        {step === 6 && (
          <div className="path-chain">
            <code>CodingAgent</code>
            <ArrowRight size={17} />
            <code>read_prod_secret</code>
            <ArrowRight size={17} />
            <code>AWS_PRODUCTION_TOKEN</code>
          </div>
        )}
        {step === 8 && (
          <div className="demo-final">
            {[
              ["Actions", events.length],
              ["Allowed", events.filter((e) => e.decision === "ALLOW").length],
              [
                "Reviewed",
                events.filter((e) => e.decision === "REVIEW").length,
              ],
              ["Blocked", events.filter((e) => e.decision === "BLOCK").length],
              [
                "Quarantined",
                new Set(
                  events
                    .filter((e) => e.quarantine_state === "QUARANTINED")
                    .map((e) => e.agent_id),
                ).size,
              ],
              [
                "Critical alert",
                events.filter(
                  (e) => e.severity === "CRITICAL" && e.decision === "BLOCK",
                ).length,
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="demo-footer">
        <span>All actions use synthetic resources and the live gateway.</span>
        {step < 8 ? (
          <button className="primary" disabled={busy} onClick={next}>
            {busy
              ? "Evaluating…"
              : step === 0
                ? "Start demo"
                : step === 6
                  ? "Keep quarantined"
                  : step === 7
                    ? "Finish demo"
                    : "Continue"}
            {step === 0 ? <Play size={16} /> : <ArrowRight size={16} />}
          </button>
        ) : (
          <button className="primary" onClick={onClose}>
            Explore the evidence
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    </Modal>
  );
}
