import { useEffect, useState } from "react";
import {
  FlaskConical,
  Play,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Bell,
} from "lucide-react";
import { Panel, Badge } from "../components/ui";
import { api, post } from "../api/client";
import type { Scenario, SentinelEvent } from "../types";
export default function RedTeamLab({
  onRefresh,
  onInspect,
  onError,
}: {
  onRefresh: () => void;
  onInspect: (e: SentinelEvent) => void;
  onError: (message: string) => void;
}) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]),
    [busy, setBusy] = useState(""),
    [reset, setReset] = useState(true),
    [result, setResult] = useState<{
      scenario: Scenario;
      events: SentinelEvent[];
      result: SentinelEvent;
      expected_met: boolean;
    } | null>(null);
  useEffect(() => {
    api<Scenario[]>("/api/redteam/scenarios")
      .then(setScenarios)
      .catch((e) => onError(e.message));
  }, [onError]);
  async function run(id: string) {
    setBusy(id);
    try {
      const r = await post<typeof result>("/api/redteam/run", {
        scenario_id: id,
        reset_agent: reset,
      });
      setResult(r);
      onRefresh();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            CONTROLLED ATTACKS · REAL DECISION PIPELINE
          </div>
          <h1>Red Team Lab</h1>
          <p>
            Challenge the boundary safely. Every scenario passes through the
            Sentinel gateway.
          </p>
        </div>
        <span className="sandbox-pill">
          <FlaskConical size={16} />
          Synthetic resources only
        </span>
      </div>
      <div className="lab-info">
        <ShieldCheck size={26} />
        <div>
          <strong>A repeatable safety demonstration</strong>
          <p>
            No real secrets, shell commands, network uploads, payments or
            production systems are used.
          </p>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={reset}
            onChange={(e) => setReset(e.target.checked)}
          />
          Reset target agent and behavior window before each scenario
        </label>
      </div>
      <div className="scenario-grid">
        {scenarios.map((s) => (
          <Panel key={s.id}>
            <div className="scenario-top">
              <span className="eyebrow">{s.category}</span>
              <Badge value={s.expected} />
            </div>
            <h3>{s.title}</h3>
            <p>{s.description}</p>
            <code>{s.tool}()</code>
            <button
              className="secondary"
              disabled={!!busy}
              onClick={() => run(s.id)}
            >
              <Play size={15} />
              {busy === s.id ? "Evaluating…" : "Run scenario"}
              <ArrowRight size={14} />
            </button>
          </Panel>
        ))}
      </div>
      {result && (
        <Panel
          title={`Result · ${result.scenario.title}`}
          subtitle={`${result.events.length} action(s) passed through the gateway`}
        >
          <div className="lab-result">
            <Badge value={result.result.decision} />
            <strong>Risk {result.result.risk_score}/100</strong>
            <span className={result.expected_met ? "text-green" : "text-red"}>
              {result.expected_met
                ? "Expected outcome confirmed"
                : "Policy configuration changed the expected outcome"}
            </span>
            <button
              className="primary"
              onClick={() => onInspect(result.result)}
            >
              Inspect decision
              <ArrowRight size={16} />
            </button>
          </div>
          <div className="detection-steps">
            {[
              [ShieldCheck, "Intercepted", result.result.action.tool],
              [
                CheckCircle2,
                "Policy checked",
                result.result.policy_result.decision,
              ],
              [
                FlaskConical,
                "Risk evaluated",
                String(result.result.risk_score) + "/100",
              ],
              [Lock, "Contained", result.result.quarantine_state],
              [Bell, "Evidence preserved", "Audit + simulated notification"],
            ].map(([I, title, text]) => {
              const C = I as typeof ShieldCheck;
              return (
                <div key={String(title)}>
                  <C size={21} />
                  <strong>{String(title)}</strong>
                  <span>{String(text)}</span>
                </div>
              );
            })}
          </div>
          <div className="reasons-list">
            {result.result.reasons.map((r, i) => (
              <div key={i}>
                <span>{i + 1}</span>
                <p>{r}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}
