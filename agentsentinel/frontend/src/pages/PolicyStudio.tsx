import { useEffect, useState } from "react";
import { Save, FileCode2, ShieldCheck } from "lucide-react";
import { stringify, parse } from "yaml";
import { api, put } from "../api/client";
import type { Agent, Policy } from "../types";
import { Panel } from "../components/ui";
export default function PolicyStudio({
  agents,
  onRefresh,
  onError,
}: {
  agents: Agent[];
  onRefresh: () => void;
  onError: (message: string) => void;
}) {
  const [id, setId] = useState("support-agent"),
    [mode, setMode] = useState("visual"),
    [policy, setPolicy] = useState<Policy | null>(null),
    [yaml, setYaml] = useState(""),
    [version, setVersion] = useState(1),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ agent_id: string; policy: Policy; yaml: string; version: number }[]>(
      "/api/policies",
    )
      .then((rows) => {
        const p = rows.find((p) => p.agent_id === id);
        if (p) {
          setPolicy(p.policy);
          setYaml(p.yaml);
          setVersion(p.version);
          setMessage("");
        }
      })
      .catch((e) => onError(e.message));
  }, [id, onError]);
  function switchMode(m: string) {
    if (m === "yaml" && policy) setYaml(stringify(policy));
    if (m === "visual")
      try {
        setPolicy(parse(yaml));
      } catch (e) {
        onError("Invalid YAML: " + (e as Error).message);
        return;
      }
    setMode(m);
  }
  async function save() {
    setBusy(true);
    try {
      const p = await put<{ policy: Policy; yaml: string; version: number }>(
        "/api/policies/" + id,
        mode === "yaml" ? { yaml } : { policy },
      );
      setPolicy(p.policy);
      setYaml(p.yaml);
      setVersion(p.version);
      setMessage("Validated policy saved. New actions use this version.");
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
          <div className="eyebrow">PERMISSIONS LIVE OUTSIDE THE MODEL</div>
          <h1>Policy studio</h1>
          <p>
            Explicit rules are the primary enforcement mechanism. DENY always
            wins.
          </p>
        </div>
        <button className="primary" disabled={busy} onClick={save}>
          <Save size={16} />
          {busy ? "Validating…" : "Validate & save"}
        </button>
      </div>
      <div className="filter-bar">
        <select
          aria-label="Policy agent"
          value={id}
          onChange={(e) => setId(e.target.value)}
        >
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <div className="segmented">
          {["visual", "yaml"].map((m) => (
            <button
              key={m}
              className={mode === m ? "selected" : ""}
              onClick={() => switchMode(m)}
            >
              {m === "visual" ? "Visual mode" : "YAML mode"}
            </button>
          ))}
        </div>
        <span className="muted">Policy version {version}</span>
      </div>
      <div className="info-callout">
        <ShieldCheck size={22} />
        <div>
          <strong>DENY → REQUIRE APPROVAL → ALLOW</strong>
          <p>
            Conflicting entries resolve to the most restrictive permission.
            Protected secrets, IAM and Sentinel controls stay prohibited.
          </p>
        </div>
      </div>
      {message && <div className="success-message">{message}</div>}
      {mode === "yaml" ? (
        <Panel
          title="Policy YAML"
          subtitle="Validated against the typed policy schema before save"
        >
          <textarea
            className="yaml-editor"
            aria-label="Policy YAML"
            value={yaml}
            onChange={(e) => setYaml(e.target.value)}
            spellCheck={false}
          />
        </Panel>
      ) : (
        policy && (
          <div className="policy-grid">
            <Panel title="Agent purpose" subtitle="Declared at registration">
              <p>{agents.find((a) => a.id === id)?.purpose}</p>
              <div className="priority-stack">
                <span className="red">01 · Explicit deny wins</span>
                <span className="amber">
                  02 · Human approval holds execution
                </span>
                <span className="green">03 · Allowed actions may execute</span>
              </div>
            </Panel>
            {[
              ["allow", "Allowed tools"],
              ["require_approval", "Approval-required tools"],
              ["deny", "Denied tools"],
              ["resources_allow", "Allowed resources"],
              ["resources_deny", "Denied resources"],
              ["network_destinations", "Network destinations"],
            ].map(([key, title]) => (
              <Panel key={key} title={title} subtitle="One entry per line">
                <textarea
                  aria-label={title}
                  value={((policy[key as keyof Policy] as string[]) || []).join(
                    "\n",
                  )}
                  onChange={(e) =>
                    setPolicy({ ...policy, [key]: e.target.value.split("\n") })
                  }
                />
              </Panel>
            ))}
            <Panel title="Rate, cost & sensitivity">
              <div className="form-grid">
                <label>
                  Calls per minute
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={policy.rate_limit}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        rate_limit: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Cost per minute ($)
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={policy.cost_limit}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        cost_limit: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="span-2">
                  Sensitivity
                  <select
                    value={policy.risk_sensitivity}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        risk_sensitivity: e.target
                          .value as Policy["risk_sensitivity"],
                      })
                    }
                  >
                    <option value="standard">Standard</option>
                    <option value="strict">Strict</option>
                  </select>
                </label>
              </div>
              <p className="footnote">
                Global quarantine rules are managed in Settings.
              </p>
            </Panel>
          </div>
        )
      )}
      <p className="footnote">
        <FileCode2 size={14} /> Policy edits are administrator actions and
        create append-only audit records.
      </p>
    </>
  );
}
