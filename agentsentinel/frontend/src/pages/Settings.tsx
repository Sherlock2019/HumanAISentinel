import { useState } from "react";
import { Save, ShieldCheck, Power, KeyRound } from "lucide-react";
import { Panel } from "../components/ui";
import { put } from "../api/client";
import type { Settings as SettingsType } from "../types";
export default function Settings({
  settings,
  onRefresh,
  onRelease,
  onError,
}: {
  settings: SettingsType;
  onRefresh: () => void;
  onRelease: () => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState(settings),
    [message, setMessage] = useState(""),
    [admin, setAdmin] = useState(
      sessionStorage.getItem("sentinel-admin-token") || "local-demo-admin",
    );
  async function save() {
    try {
      await put("/api/system/settings", draft);
      setMessage("Runtime settings saved and audited.");
      onRefresh();
    } catch (e) {
      onError((e as Error).message);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CONTROL THE RUNTIME</div>
          <h1>Administration settings</h1>
          <p>
            Containment thresholds, advisory evaluation and simulated alert
            channels.
          </p>
        </div>
        <button className="primary" onClick={save}>
          <Save size={16} />
          Save settings
        </button>
      </div>
      {message && <div className="success-message">{message}</div>}
      <div className="settings-grid">
        <Panel
          title="Safety evaluator"
          subtitle="Provider selected through local environment configuration"
        >
          <div className="provider-display">
            <ShieldCheck size={32} />
            <strong>{settings.ai_provider.toUpperCase()}</strong>
            <span>
              {settings.ai_provider === "mock"
                ? "Deterministic evaluation · no API keys required"
                : "Advisory provider · failures require review"}
            </span>
          </div>
          <p>
            Available adapters: Mock, Ollama, OpenAI, Gemini and Anthropic.
            Provider credentials stay in the backend environment and are never
            exposed in this screen.
          </p>
        </Panel>
        <Panel title="Automatic containment">
          <label className="setting-row">
            Auto quarantine enabled
            <input
              type="checkbox"
              checked={draft.auto_quarantine}
              onChange={(e) =>
                setDraft({ ...draft, auto_quarantine: e.target.checked })
              }
            />
          </label>
          <label className="setting-row">
            Blocked retry threshold
            <input
              type="number"
              min={1}
              max={10}
              value={draft.blocked_retry_threshold}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  blocked_retry_threshold: Number(e.target.value),
                })
              }
            />
          </label>
          <p className="footnote">
            Counted within a 60-second behavior window. Disabling quarantine
            does not authorize prohibited actions.
          </p>
        </Panel>
        <Panel title="Risk thresholds">
          <label className="setting-row">
            Human review begins
            <input
              type="number"
              min={30}
              max={79}
              value={draft.review_threshold}
              onChange={(e) =>
                setDraft({ ...draft, review_threshold: Number(e.target.value) })
              }
            />
          </label>
          <label className="setting-row">
            Critical block begins
            <input
              type="number"
              min={80}
              max={100}
              value={draft.critical_threshold}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  critical_threshold: Number(e.target.value),
                })
              }
            />
          </label>
          <label className="setting-row">
            Global policy mode
            <select
              value={draft.global_policy_mode}
              onChange={(e) =>
                setDraft({ ...draft, global_policy_mode: e.target.value })
              }
            >
              <option value="standard">Standard</option>
              <option value="strict">Strict</option>
            </select>
          </label>
        </Panel>
        <Panel
          title="Simulated alert channels"
          subtitle="Notification payloads are stored as audit evidence"
        >
          {[
            "Dashboard",
            "Email simulation",
            "Slack simulation",
            "Webhook simulation",
          ].map((c) => (
            <label className="setting-row" key={c}>
              {c}
              <input
                type="checkbox"
                checked={draft.alert_channels.includes(c)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    alert_channels: e.target.checked
                      ? [...draft.alert_channels, c]
                      : draft.alert_channels.filter((x) => x !== c),
                  })
                }
              />
            </label>
          ))}
        </Panel>
        <Panel title="Global emergency stop">
          <div className="provider-display">
            <Power size={28} />
            <strong>
              {settings.emergency_stopped ? "STOP ENGAGED" : "READY"}
            </strong>
            <span>
              {settings.emergency_stopped
                ? "All agents are disabled. Release, then restore agents individually."
                : "Emergency stop is available from the top bar."}
            </span>
          </div>
          {settings.emergency_stopped && (
            <button className="secondary" onClick={onRelease}>
              Release global stop
            </button>
          )}
        </Panel>
        <Panel title="Local administrator session">
          <p>
            The POC uses a local demo token for administrative mutations. If you
            customize ADMIN_TOKEN in .env, enter the same value here.
          </p>
          <label>
            Admin token
            <input
              type="password"
              autoComplete="off"
              value={admin}
              onChange={(e) => setAdmin(e.target.value)}
            />
          </label>
          <button
            className="secondary"
            onClick={() => {
              sessionStorage.setItem("sentinel-admin-token", admin);
              setMessage("Local admin session updated.");
            }}
          >
            <KeyRound size={15} />
            Update local session
          </button>
        </Panel>
      </div>
    </>
  );
}
