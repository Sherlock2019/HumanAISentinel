import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { Panel, Empty } from "../components/ui";
import type { Metrics as MetricsType } from "../types";
const COLORS: Record<string, string> = {
  ALLOW: "#259b81",
  LOW: "#259b81",
  BLOCK: "#dc5560",
  CRITICAL: "#dc5560",
  REVIEW: "#d79b31",
  HIGH: "#d79b31",
  MEDIUM: "#397bbd",
};
export default function Metrics({ metrics: m }: { metrics: MetricsType }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MEASURE ENFORCEMENT</div>
          <h1>Runtime metrics</h1>
          <p>Decision distribution, behavioral signals and agent risk.</p>
        </div>
      </div>
      <div className="metrics-kpis">
        {[
          ["Total actions", m.total_actions],
          ["Average risk", m.average_risk],
          ["Policy violations", m.policy_violations],
          ["Prompt injections", m.prompt_injection_detections],
          ["Tool abuse attempts", m.tool_abuse_attempts],
          ["Critical events", m.critical_events],
        ].map(([label, value]) => (
          <div className="kpi" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="metrics-grid">
        <Panel title="Actions over time">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={m.timeline}>
              <CartesianGrid strokeDasharray="3 5" />
              <XAxis dataKey="time" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line dataKey="actions" stroke="#259b81" strokeWidth={2} />
              <Line dataKey="blocked" stroke="#dc5560" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Risk over time">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={m.timeline}>
              <CartesianGrid strokeDasharray="3 5" />
              <XAxis dataKey="time" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Line dataKey="risk" stroke="#d79b31" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
        {[
          ["Decisions by type", m.decisions],
          ["Events by severity", m.severity],
        ].map(([title, data]) => (
          <Panel key={String(title)} title={String(title)}>
            {(data as typeof m.decisions).length ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={data as typeof m.decisions}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={4}
                  >
                    {(data as typeof m.decisions).map((entry, i) => (
                      <Cell key={i} fill={COLORS[entry.name] || "#397bbd"} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty title="Waiting for actions" />
            )}
          </Panel>
        ))}
        <Panel title="Tool usage">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={m.tools} layout="vertical" margin={{ left: 20 }}>
              <XAxis type="number" allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={135}
                tick={{ fontSize: 11 }}
              />
              <Tooltip />
              <Bar dataKey="value" fill="#397bbd" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Agent risk ranking">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={m.ranking} layout="vertical" margin={{ left: 20 }}>
              <XAxis type="number" domain={[0, 100]} />
              <YAxis
                type="category"
                dataKey="name"
                width={160}
                tick={{ fontSize: 11 }}
              />
              <Tooltip />
              <Bar dataKey="risk" fill="#dc5560" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>
      <div className="info-callout">
        Top risky tool: <strong>{m.top_risky_tool}</strong> · Top risky agent:{" "}
        <strong>{m.top_risky_agent}</strong>
      </div>
    </>
  );
}
