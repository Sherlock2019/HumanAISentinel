import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Shield,
  ShieldCheck,
  TriangleAlert,
  Lock,
  Play,
  Radio,
  Workflow,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Badge, Panel, RiskBar, Empty, LinkButton } from "../components/ui";
import { ago, time } from "../api/client";
import type { Agent, SentinelEvent, Metrics, Alert } from "../types";
export default function Dashboard({
  agents,
  events,
  metrics: m,
  alerts,
  onDemo,
  onInspect,
  onNavigate,
}: {
  agents: Agent[];
  events: SentinelEvent[];
  metrics: Metrics;
  alerts: Alert[];
  onDemo: () => void;
  onInspect: (e: SentinelEvent) => void;
  onNavigate: (page: string) => void;
}) {
  const kpis = [
    {
      label: "Active agents",
      value: m.active_agents,
      icon: Bot,
      color: "blue",
      detail: "Connected to gateway",
    },
    {
      label: "Safe agents",
      value: m.safe_agents,
      icon: ShieldCheck,
      color: "green",
      detail: "Within declared intent",
    },
    {
      label: "Under review",
      value: m.under_review,
      icon: Activity,
      color: "amber",
      detail: "Awaiting human decision",
    },
    {
      label: "Quarantined",
      value: m.quarantined_agents,
      icon: Lock,
      color: "red",
      detail: "Sessions contained",
    },
    {
      label: "Blocked actions",
      value: m.blocked,
      icon: Shield,
      color: "red",
      detail: "Stopped before execution",
    },
    {
      label: "Critical alerts",
      value: m.critical_alerts,
      icon: TriangleAlert,
      color: "amber",
      detail: "Need your attention",
    },
  ];
  const health = m.health_score;
  const incident = events.find((e) => e.decision === "BLOCK");
  return (
    <>
      <div className="dashboard-heading">
        <div>
          <div className="eyebrow">
            <span className="live-dot" /> RUNTIME PROTECTION · LOCAL SANDBOX
          </div>
          <h1>Security operations</h1>
          <p>Every agent action. Checked before it reaches the real world.</p>
        </div>
        <button className="primary" onClick={onDemo}>
          <Play size={16} fill="currentColor" />
          Run guided demo
          <ArrowUpRight size={16} />
        </button>
      </div>
      <div className="hero-banner">
        <div className="hero-shield">
          <ShieldCheck size={31} />
        </div>
        <div>
          <span className="eyebrow">AI AGENT RUNTIME SAFETY GUARD</span>
          <h2>Autonomous agents. Human control.</h2>
          <p>
            Define their purpose. Verify their actions. Contain the unexpected.
          </p>
        </div>
        <div className="hero-flow">
          <span>
            <Bot size={17} />
            Agent
          </span>
          <ArrowRight size={16} />
          <span className="gateway">
            <ShieldCheck size={17} />
            Sentinel
          </span>
          <ArrowRight size={16} />
          <span>
            <Workflow size={17} />
            Tools
          </span>
        </div>
        <button className="hero-link" onClick={() => onNavigate("how")}>
          See how it works
          <ArrowUpRight size={16} />
        </button>
      </div>
      <div className="kpi-grid">
        {kpis.map((k) => (
          <div className="kpi" key={k.label}>
            <div className="kpi-top">
              <span>{k.label}</span>
              <k.icon size={17} className={`text-${k.color}`} />
            </div>
            <strong>{k.value.toString().padStart(2, "0")}</strong>
            <small>{k.detail}</small>
          </div>
        ))}
      </div>
      <div className="overview-grid">
        <Panel
          title="Protection overview"
          subtitle="A live view of gateway decisions"
          action={
            <span className="subtle-tag">
              <span className="live-dot" />
              Live
            </span>
          }
        >
          <div className="chart-stats">
            <div>
              <strong>{m.total_actions}</strong>
              <span>Total intercepted</span>
            </div>
            <div>
              <strong className="text-green">{m.allowed}</strong>
              <span>Allowed safely</span>
            </div>
            <div>
              <strong className="text-red">{m.blocked}</strong>
              <span>Prevented</span>
            </div>
            <div className="chart-legend">
              <i />
              Actions
              <i className="red" />
              Blocked
            </div>
          </div>
          <div className="chart-wrap">
            {m.timeline.length ? (
              <ResponsiveContainer width="100%" height={178}>
                <AreaChart data={m.timeline}>
                  <defs>
                    <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="#2c9c86"
                        stopOpacity={0.18}
                      />
                      <stop offset="100%" stopColor="#2c9c86" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 5"
                    vertical={false}
                    stroke="#e9edf1"
                  />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="actions"
                    stroke="#289b82"
                    fill="url(#areaFill)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="blocked"
                    stroke="#de6267"
                    fill="transparent"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="chart-empty">
                <Activity size={25} />
                <span>
                  Your first action starts the live protection timeline.
                </span>
                <button className="link-btn" onClick={onDemo}>
                  Start the demo
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
          </div>
        </Panel>
        <Panel
          title="System safety score"
          subtitle="100 means all registered agents are low risk"
        >
          <div className="gauge">
            <ResponsiveContainer width="100%" height={175}>
              <PieChart>
                <Pie
                  data={[{ value: health }, { value: 100 - health }]}
                  startAngle={210}
                  endAngle={-30}
                  innerRadius={65}
                  outerRadius={78}
                  dataKey="value"
                  stroke="none"
                  isAnimationActive={false}
                >
                  <Cell fill={health >= 70 ? "#259b81" : "#d78c13"} />
                  <Cell fill="#edf0f3" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="gauge-value">
              <strong>{health}</strong>
              <span>/ 100</span>
            </div>
          </div>
          <div className="gauge-label">
            <Badge value={health >= 70 ? "HEALTHY" : "ATTENTION"} />
            <p>
              {health >= 70
                ? "Gateway is enforcing declared permissions."
                : "Contained incidents are affecting agent safety scores."}
            </p>
          </div>
          <div className="health-footer">
            <CheckCircle2 size={15} />
            <span>Gateway online</span>
            <span>{agents.length} registered agents</span>
          </div>
        </Panel>
      </div>
      <Panel
        title="Live agent status"
        subtitle="Declared intent, current activity and runtime containment"
        action={
          <LinkButton onClick={() => onNavigate("agents")}>
            Manage agents
          </LinkButton>
        }
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Agent / purpose</th>
                <th>Current task</th>
                <th>Risk score</th>
                <th>Status</th>
                <th>Actions/min</th>
                <th>Blocked</th>
                <th>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a, i) => (
                <tr
                  key={a.id}
                  onClick={() => onNavigate("agents")}
                  className="clickable"
                >
                  <td>
                    <div className="agent-cell">
                      <span className={`agent-icon agent-${i % 4}`}>
                        <Bot size={19} />
                      </span>
                      <div>
                        <strong>{a.name}</strong>
                        <small title={a.purpose}>{a.purpose}</small>
                      </div>
                    </div>
                  </td>
                  <td className="task-cell">{a.current_task}</td>
                  <td>
                    <RiskBar score={a.risk_score} />
                  </td>
                  <td>
                    <Badge
                      value={
                        a.status === "RUNNING" && a.risk_score < 30
                          ? "SAFE"
                          : a.status
                      }
                    />
                  </td>
                  <td>{a.actions_per_minute}</td>
                  <td>{a.blocked}</td>
                  <td className="muted">{ago(a.last_activity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="bottom-grid">
        <Panel
          title="Gateway activity"
          subtitle="Latest actions, evaluated before execution"
          action={
            <LinkButton onClick={() => onNavigate("monitor")}>
              Live monitor
            </LinkButton>
          }
        >
          {events.length ? (
            <div className="activity-list">
              {events.slice(0, 4).map((e) => (
                <button
                  key={e.id}
                  className="activity-row"
                  onClick={() => onInspect(e)}
                >
                  <span className={`activity-icon ${e.decision.toLowerCase()}`}>
                    {e.decision === "ALLOW" ? (
                      <CheckCircle2 size={17} />
                    ) : e.decision === "REVIEW" ? (
                      <Activity size={17} />
                    ) : (
                      <Shield size={17} />
                    )}
                  </span>
                  <div>
                    <strong>{e.agent_name}</strong>
                    <span>
                      {e.action.tool}
                      <small> · {e.action.resource}</small>
                    </span>
                  </div>
                  <Badge value={e.decision} />
                  <time>{time(e.timestamp)}</time>
                  <ArrowUpRight size={15} />
                </button>
              ))}
            </div>
          ) : (
            <Empty />
          )}
        </Panel>
        <Panel
          title="Attention center"
          subtitle="Clear evidence. A human decision."
          action={
            <LinkButton onClick={() => onNavigate("alerts")}>
              All alerts
            </LinkButton>
          }
        >
          {incident ? (
            <button
              className="incident-card"
              onClick={() => onInspect(incident)}
            >
              <span className="eyebrow text-red">
                <TriangleAlert size={14} /> ACTION PREVENTED
              </span>
              <h3>{incident.agent_name}</h3>
              <p>
                Attempted <code>{incident.action.tool}</code> outside its
                declared purpose.
              </p>
              <div>
                <Badge value={incident.quarantine_state} />
                <span>
                  Inspect the decision <ArrowRight size={14} />
                </span>
              </div>
            </button>
          ) : (
            <div className="calm-state">
              <ShieldCheck size={36} />
              <h3>All clear. Stay in control.</h3>
              <p>
                No blocked actions yet. Run a controlled attack to see automatic
                containment.
              </p>
              <button
                className="secondary"
                onClick={() => onNavigate("redteam")}
              >
                Open Red Team Lab
                <ArrowUpRight size={14} />
              </button>
            </div>
          )}
          <div className="alert-foot">
            <Radio size={14} />
            {alerts.filter((a) => !a.acknowledged).length} open alerts ·
            notifications simulated
          </div>
        </Panel>
      </div>
      <div className="principle-strip">
        <ShieldCheck size={16} />
        <span>AI agents should not police themselves.</span>
        <span>Keep humans in control.</span>
      </div>
    </>
  );
}
