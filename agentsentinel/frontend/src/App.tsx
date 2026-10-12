import { useCallback, useState, useEffect } from "react";
import {
  ShieldCheck,
  LayoutDashboard,
  Bot,
  Radio,
  Bell,
  ScanSearch,
  Network,
  FileCheck2,
  FlaskConical,
  ChartNoAxesCombined,
  ScrollText,
  Brain,
  Settings as SettingsIcon,
  ChevronRight,
  Power,
  Menu,
  X,
  Play,
  RefreshCw,
  ArrowRight,
  Info,
  GitCommitHorizontal,
  Crosshair,
} from "lucide-react";
import { useSentinel } from "./hooks/useSentinel";
import { api, post } from "./api/client";
import { Modal } from "./components/ui";
import Dashboard from "./pages/Dashboard";
import HowItWorks from "./pages/HowItWorks";
import EventInspector from "./pages/EventInspector";
import Agents from "./pages/Agents";
import { LiveMonitor, Alerts, AuditTrail } from "./pages/Operations";
import CapabilityMap from "./pages/CapabilityMap";
import PolicyStudio from "./pages/PolicyStudio";
import RedTeamLab from "./pages/RedTeamLab";
import Metrics from "./pages/Metrics";
import Settings from "./pages/Settings";
import GuidedDemo from "./components/GuidedDemo";
import CommitDemo from "./pages/CommitDemo";
import IntentMonitor from "./pages/IntentMonitor";
import type { SentinelEvent } from "./types";
const nav = [
  ["how", "How It Works", Brain],
  ["commit", "GitHub Integration", GitCommitHorizontal],
  ["dashboard", "Security Operations", LayoutDashboard],
  ["intent", "Intent Sentinel", Crosshair],
  ["agents", "Agents", Bot],
  ["monitor", "Live Monitor", Radio],
  ["alerts", "Alerts", Bell],
  ["inspector", "Event Inspector", ScanSearch],
  ["capability", "Capability Map", Network],
  ["policies", "Policy Studio", FileCheck2],
  ["redteam", "Red Team Lab", FlaskConical],
  ["metrics", "Metrics", ChartNoAxesCombined],
  ["audit", "Audit Trail", ScrollText],
  ["settings", "Settings", SettingsIcon],
] as const;
export default function App() {
  const data = useSentinel();
  const [page, setPage] = useState(location.hash.slice(1) || "how"),
    [selected, setSelected] = useState<SentinelEvent | null>(null),
    [demo, setDemo] = useState(false),
    [kill, setKill] = useState(false),
    [notice, setNotice] = useState(""),
    [mobile, setMobile] = useState(false),
    [capAgent, setCapAgent] = useState("support-agent"),
    [intentSession, setIntentSession] = useState(""),
    [working, setWorking] = useState(false);
  const error = useCallback((message: string) => setNotice(message), []);
  useEffect(() => {
    const change = () => setPage(location.hash.slice(1) || "how");
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  function navigate(id: string) {
    setNotice("");
    setPage(id);
    location.hash = id;
    setMobile(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function inspect(e: SentinelEvent) {
    setSelected(e);
    navigate("inspector");
  }
  async function investigate(id: string) {
    try {
      inspect(await api<SentinelEvent>("/api/events/" + id));
    } catch (e) {
      error((e as Error).message);
    }
  }
  async function control(id: string, op: string) {
    try {
      await post("/api/agents/" + id + "/" + op);
      await data.refresh();
      setNotice(
        `Agent ${op === "resume" ? "restored with a new synthetic session" : op === "kill" ? "disabled" : op === "pause" ? "paused" : "quarantined"}. Action recorded in audit.`,
      );
    } catch (e) {
      error((e as Error).message);
    }
  }
  async function review(id: string, decision: string) {
    try {
      const e = await post<SentinelEvent>("/api/events/" + id + "/review", {
        decision,
      });
      setSelected(e);
      await data.refresh();
    } catch (e) {
      error((e as Error).message);
    }
  }
  async function stop() {
    setWorking(true);
    try {
      await post("/api/system/emergency-stop");
      setKill(false);
      await data.refresh();
      setNotice(
        "Emergency stop engaged. All synthetic sessions revoked; future actions are blocked.",
      );
    } catch (e) {
      error((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  const common = { onRefresh: data.refresh, onError: error };
  const current = nav.find((n) => n[0] === page)?.[1] || "How It Works";
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a className="brand" href="#how" onClick={() => navigate("how")}>
          <span className="brand-mark">
            <ShieldCheck size={25} />
          </span>
          <span>
            agent<span className="brand-accent">sentinel</span>
            <small>AI RUNTIME SAFETY GUARD</small>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-avatar">AS</span>
          <div>
            <strong>Demo workspace</strong>
            <small>Local · Sandbox environment</small>
          </div>
          <ChevronRight size={14} />
        </div>
        <div className="nav-label">CONTROL CENTER</div>
        <nav>
          {nav.map(([id, title, I]) => (
            <button
              key={id}
              aria-label={title}
              aria-current={page === id ? "page" : undefined}
              className={page === id ? "active" : ""}
              onClick={() => navigate(id)}
            >
              <I size={18} />
              <span>{title}</span>
              {id === "alerts" && data.metrics?.critical_alerts ? (
                <i className="nav-count">{data.metrics.critical_alerts}</i>
              ) : id === "how" ? (
                <span className="nav-new">START HERE</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div>
            <span className={`live-dot ${data.error ? "offline" : ""}`} />
            <strong>Sentinel Gateway</strong>
            <span>{data.error ? "OFFLINE" : "ONLINE"}</span>
          </div>
          <p>Policy enforced before execution.</p>
          <div className="sidebar-footer">
            AgentSentinel POC<span>v1.0</span>
          </div>
        </div>
      </aside>
      {mobile && (
        <div className="sidebar-overlay" onClick={() => setMobile(false)} />
      )}
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobile(true)}
          >
            <Menu size={22} />
          </button>
          <div className="breadcrumbs">
            <ShieldCheck size={15} />
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{current}</strong>
          </div>
          <div className="topbar-actions">
            <span className="sandbox-pill">
              <FlaskConical size={14} />
              Demo sandbox
            </span>
            <button className="emergency" onClick={() => setKill(true)}>
              <Power size={15} />
              <span>Emergency stop</span>
            </button>
            <span className="admin-avatar">AD</span>
          </div>
        </header>
        <main>
          {data.error && (
            <div className="offline-banner">
              <Info size={20} />
              <div>
                <strong>Backend connection unavailable</strong>
                <p>
                  {data.error}. Start the local services or retry the
                  connection.
                </p>
              </div>
              <button className="secondary" onClick={data.refresh}>
                <RefreshCw size={15} />
                Retry
              </button>
            </div>
          )}
          {data.settings?.emergency_stopped && (
            <div className="danger-callout">
              <Power size={24} />
              <div>
                <h3>Global emergency stop is engaged</h3>
                <p>
                  All agents are disabled. Release the stop in Settings, then
                  restore agents individually.
                </p>
              </div>
              <button
                className="secondary"
                onClick={() => navigate("settings")}
              >
                Manage stop
                <ArrowRight size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              <Info size={17} />
              <span>{notice}</span>
              <button
                className="icon-btn"
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {data.loading ? (
            <div className="loading-state">
              <ShieldCheck size={38} />
              <h2>Connecting to the Sentinel gateway…</h2>
              <p>Loading registered intent and runtime evidence.</p>
            </div>
          ) : (
            <>
              {page === "dashboard" && data.metrics && (
                <Dashboard
                  agents={data.agents}
                  events={data.events}
                  alerts={data.alerts}
                  metrics={data.metrics}
                  onDemo={() => setDemo(true)}
                  onInspect={inspect}
                  onNavigate={navigate}
                />
              )}
              {page === "how" && (
                <HowItWorks
                  onDemo={() => setDemo(true)}
                  provider={data.settings?.ai_provider}
                  onCommit={() => navigate("commit")}
                />
              )}
              {page === "commit" && (
                <CommitDemo onInspect={inspect} onRefresh={data.refresh} />
              )}
              {page === "agents" && (
                <Agents agents={data.agents} onControl={control} {...common} />
              )}
              {page === "monitor" && (
                <LiveMonitor
                  agents={data.agents}
                  events={data.events}
                  onInspect={inspect}
                />
              )}
              {page === "alerts" && (
                <Alerts
                  alerts={data.alerts}
                  onInspect={investigate}
                  onControl={control}
                  onAcknowledge={async (id) => {
                    try {
                      await post("/api/alerts/" + id + "/acknowledge");
                      await data.refresh();
                    } catch (e) {
                      error((e as Error).message);
                    }
                  }}
                />
              )}
              {page === "inspector" && (
                <EventInspector
                  event={selected || data.events[0] || null}
                  events={data.events}
                  onSelect={setSelected}
                  onReview={review}
                  onCapabilities={() => {
                    setCapAgent(selected?.agent_id || "support-agent");
                    navigate("capability");
                  }}
                />
              )}
              {page === "capability" && (
                <CapabilityMap
                  agents={data.agents}
                  initialAgent={capAgent}
                  onError={error}
                />
              )}
              {page === "policies" && (
                <PolicyStudio agents={data.agents} {...common} />
              )}
              {page === "redteam" && (
                <RedTeamLab
                  {...common}
                  onInspect={inspect}
                  onMonitor={(sessionId) => {
                    setIntentSession(sessionId);
                    navigate("intent");
                  }}
                />
              )}
              {page === "intent" && (
                <IntentMonitor
                  initialSession={intentSession}
                  onControl={control}
                  onError={error}
                  onNavigate={navigate}
                />
              )}
              {page === "metrics" && data.metrics && (
                <Metrics metrics={data.metrics} />
              )}
              {page === "audit" && (
                <AuditTrail agents={data.agents} onError={error} />
              )}
              {page === "settings" && data.settings && (
                <Settings
                  settings={data.settings}
                  {...common}
                  onRelease={async () => {
                    try {
                      await post("/api/system/release-stop");
                      await data.refresh();
                      setNotice(
                        "Global stop released. Agents remain disabled until restored individually.",
                      );
                    } catch (e) {
                      error((e as Error).message);
                    }
                  }}
                />
              )}
            </>
          )}
          <footer className="main-footer">
            <span>
              <ShieldCheck size={14} />
              AgentSentinel · AI Agent Runtime Safety Guard
            </span>
            <span>Simulated tools. Enforced decisions. Human control.</span>
            <button className="link-btn" onClick={() => setDemo(true)}>
              <Play size={12} />
              Guided demo
            </button>
          </footer>
        </main>
      </div>
      {demo && (
        <GuidedDemo
          onClose={() => setDemo(false)}
          onRefresh={data.refresh}
          onInspect={inspect}
          onMap={() => {
            setCapAgent("coding-agent");
            navigate("capability");
          }}
          onError={error}
        />
      )}
      {kill && (
        <Modal title="Emergency stop all agents" onClose={() => setKill(false)}>
          <div className="confirm-content">
            <div className="demo-icon danger">
              <Power size={30} />
            </div>
            <h3>Disable every synthetic agent session?</h3>
            <p>
              This immediately blocks future actions, revokes demo tokens and
              cancels pending reviews. An audit record preserves the
              intervention.
            </p>
            <small>
              Recovery: release the global stop, then restore each agent.
            </small>
          </div>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setKill(false)}>
              Cancel
            </button>
            <button className="danger" disabled={working} onClick={stop}>
              {working ? "Stopping…" : "Emergency stop all agents"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
