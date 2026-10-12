import {
  Activity,
  ArrowRight,
  Bell,
  Bot,
  Brain,
  CheckCircle2,
  FileCheck2,
  Lock,
  Scale,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { Panel } from "./ui";

const stages = [
  {
    title: "AI Agents",
    icon: Bot,
    detail: "Propose a tool call to complete a task.",
  },
  {
    title: "Runtime Gateway",
    icon: ShieldCheck,
    detail: "Hold the call before the tool executes.",
  },
  {
    title: "Safety Checks",
    icon: Brain,
    detail: "Policy + LLM Safety Judge + Behavioral Detection.",
  },
  {
    title: "Decision",
    icon: Scale,
    detail: "Allow / Human Approval / Block.",
  },
  {
    title: "Automatic Kill Switch",
    icon: Lock,
    detail: "Contain critical or repeated violations; revoke the session.",
  },
  {
    title: "Alerts + Audit",
    icon: Bell,
    detail: "Notify on risky actions. Record every decision.",
  },
];

export function JuryWorkflow() {
  return (
    <section
      id="jury-workflow"
      className="jury-section"
      aria-labelledby="workflow-title"
    >
      <div className="explain-section-title">
        <span className="eyebrow">01 · THE WORKFLOW</span>
        <h2 id="workflow-title">One gateway. Three possible outcomes.</h2>
        <p>The agent asks. Sentinel checks. Only authorized actions execute.</p>
      </div>
      <ol className="jury-pipeline" aria-label="AgentSentinel runtime workflow">
        {stages.map((stage, i) => (
          <li key={stage.title}>
            <div className="pipeline-top">
              <stage.icon size={23} />
              <span>{String(i + 1).padStart(2, "0")}</span>
            </div>
            <h3>{stage.title}</h3>
            <p>{stage.detail}</p>
            {i === 4 && <small>Only when containment is triggered</small>}
            {i < stages.length - 1 && (
              <ArrowRight
                className="pipeline-arrow"
                size={18}
                aria-hidden="true"
              />
            )}
          </li>
        ))}
      </ol>
      <div className="workflow-note">
        <FileCheck2 size={18} />
        <p>
          <strong>The LLM advises; policy enforces.</strong> An AI
          recommendation cannot override a deny. Capability-path checks also
          detect dangerous tool chains.
        </p>
      </div>
      <div className="decision-paths jury-workflows">
        <article className="decision-card green">
          <CheckCircle2 size={24} />
          <span className="eyebrow">WORKFLOW A · SAFE ACTION</span>
          <h3>ALLOW</h3>
          <p>A support agent searches the help center.</p>
          <strong>Checks pass → Tool runs → Audit record</strong>
          <small>
            Proof: a synthetic execution receipt. No kill switch needed.
          </small>
        </article>
        <article className="decision-card amber">
          <UserCheck size={24} />
          <span className="eyebrow">WORKFLOW B · HUMAN CONTROL</span>
          <h3>HUMAN APPROVAL</h3>
          <p>A finance agent prepares a payment request.</p>
          <strong>Hold → Human decision → Recheck permissions</strong>
          <small>
            Approval executes the sandbox tool; rejection does not. Both are
            audited.
          </small>
        </article>
        <article className="decision-card red">
          <Lock size={24} />
          <span className="eyebrow">WORKFLOW C · CRITICAL THREAT</span>
          <h3>BLOCK + CONTAIN</h3>
          <p>A coding agent tries to read a production secret.</p>
          <strong>Block → Automatic kill switch → Alerts + Audit</strong>
          <small>
            Proof: no tool execution, a revoked session and a quarantined agent.
          </small>
        </article>
      </div>
    </section>
  );
}

const components = [
  {
    name: "Agent + tool simulators",
    type: "Demo",
    role: "Four agent roles propose actions against synthetic tools and resources.",
    tech: "Python scenario runner + tool registry",
    proof:
      "Compare requested tool calls with actual sandbox execution receipts.",
  },
  {
    name: "AgentSentinel Runtime Gateway",
    type: "Safety",
    role: "Authenticate the agent and intercept every simulated action before execution.",
    tech: "FastAPI + Pydantic contracts",
    proof: "A blocked or pending action never reaches the tool.",
  },
  {
    name: "Policy Engine",
    type: "Safety",
    role: "Enforce least privilege, default deny, tool/resource/network rules and approval requirements; reject policy bypasses.",
    tech: "Deterministic Python rules + YAML policies",
    proof: "Explicit DENY wins even if the AI recommends ALLOW.",
  },
  {
    name: "LLM Safety Judge",
    type: "AI",
    role: "Evaluate intent alignment, prompt injection, data exposure, privilege risk, necessity and reversibility.",
    tech: "Structured safety scores + a provider adapter",
    proof: "Explain why reading a secret does not serve a code-review task.",
  },
  {
    name: "AI Provider Interface + Mock Judge",
    type: "AI",
    role: "Use repeatable mock judgments by default, or select a configured model provider.",
    tech: "Mock / Ollama / OpenAI / Gemini / Anthropic adapters",
    proof:
      "Mock runs without keys. Live-provider adapters exist but are not live-verified.",
  },
  {
    name: "Behavioral Detection",
    type: "Safety",
    role: "Detect blocked retries, unusual tools and repeated-call loops using recent history.",
    tech: "Python rules + rolling 60-second history",
    proof:
      "Repeated denials trigger containment. This is rule-based, not a trained ML detector.",
  },
  {
    name: "Rate + Cost Guards",
    type: "Safety",
    role: "Check actions per minute and the agent’s synthetic usage budget.",
    tech: "Per-agent policy limits + behavior store",
    proof:
      "A runaway loop or excess synthetic cost raises risk and stops execution.",
  },
  {
    name: "Capability Graph + Path Analyzer",
    type: "Safety",
    role: "Trace indirect tool chains that could reach a protected resource or write.",
    tech: "Graph traversal + React Flow visualization",
    proof:
      "A harmless-looking workflow can expose a dangerous transitive capability.",
  },
  {
    name: "Risk + Decision Engine",
    type: "Safety",
    role: "Combine policy, semantic, behavior, sensitivity and reversibility signals.",
    tech: "Weighted 0–100 score + hard-deny / risk-floor rules",
    proof: "See ALLOW, REVIEW or BLOCK with reasons and a reproducible score.",
  },
  {
    name: "Human Approval Flow",
    type: "Control",
    role: "Hold high-impact authorized requests for a named administrator’s decision.",
    tech: "Pending review state + policy/state revalidation",
    proof: "Approval runs once; revoked permissions cannot be overridden.",
  },
  {
    name: "State Manager + Kill Switches",
    type: "Control",
    role: "Pause, quarantine or disable agents, revoke sessions and cancel pending actions.",
    tech: "Python state machine + per-agent / global controls",
    proof:
      "Critical threats auto-quarantine. Emergency stop disables every demo agent.",
  },
  {
    name: "Alerts + Notification Simulator",
    type: "Evidence",
    role: "Show what happened, why it was risky and how Sentinel responded.",
    tech: "Alert records + dashboard / email / Slack / webhook payloads",
    proof:
      "Investigate and acknowledge alerts. External delivery is simulated.",
  },
  {
    name: "Audit Log + Metrics",
    type: "Evidence",
    role: "Preserve decisions and admin actions; summarize runtime outcomes.",
    tech: "SQLAlchemy + SQLite + SHA-256 hash chain + JSON/CSV",
    proof: "Verify the evidence chain and export the decision history.",
  },
  {
    name: "Dashboard + Guided Demo + GitHub Integration + Red Team Lab",
    type: "Demo",
    role: "Present live events, policies, capability paths, 11 lab scenarios, 3 mock commit workflows and real public GitHub diff intake.",
    tech: "React + TypeScript + Tailwind + React Flow + Recharts",
    proof: "Run the three-outcome story, then inspect the supporting evidence.",
  },
  {
    name: "Tests + Local Runtime",
    type: "Foundation",
    role: "Check enforcement, browser interactions and startup/shutdown behavior.",
    tech: "pytest + Playwright + start.sh / stop.sh + Docker Compose",
    proof: "Run regression checks locally. Automated CI/CD is a roadmap item.",
  },
];

export function WhatMakesItWork({ provider }: { provider?: string }) {
  return (
    <section
      id="jury-components"
      className="jury-section"
      aria-labelledby="components-title"
    >
      <div className="explain-section-title">
        <span className="eyebrow">02 · THE BUILDING BLOCKS</span>
        <h2 id="components-title">What Makes It Work</h2>
        <p>
          AI evaluates context. Deterministic controls enforce boundaries.
          Evidence proves the result.
        </p>
      </div>
      <div className="component-legend">
        <span>
          <Brain size={17} /> AI: semantic evaluation
        </span>
        <span>
          <ShieldCheck size={17} /> Rules: enforceable safety
        </span>
        <span>
          <Activity size={17} /> Evidence: visible proof
        </span>
      </div>
      <Panel>
        <div className="table-scroll">
          <table className="component-table">
            <caption>
              Implemented components, their technology and what the jury can
              verify
            </caption>
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col">Component</th>
                <th scope="col">What it does</th>
                <th scope="col">Main tech</th>
                <th scope="col">What it proves</th>
              </tr>
            </thead>
            <tbody>
              {components.map((component, i) => (
                <tr key={component.name}>
                  <td data-label="Step">{String(i + 1).padStart(2, "0")}</td>
                  <td data-label="Component">
                    <strong>{component.name}</strong>
                    <span
                      className={`component-kind ${component.type === "AI" ? "ai" : ""}`}
                    >
                      {component.type}
                    </span>
                  </td>
                  <td data-label="What it does">{component.role}</td>
                  <td data-label="Main tech">{component.tech}</td>
                  <td data-label="What it proves">{component.proof}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="poc-boundary">
        <span className="eyebrow">HONEST DEMO BOUNDARY</span>
        <p>
          <strong>
            Configured evaluator:{" "}
            {provider ? provider.toUpperCase() : "unavailable"}.
          </strong>{" "}
          {provider === "mock"
            ? "Mock is a deterministic stand-in, not a live LLM. "
            : provider
              ? "A provider adapter is selected; inspect each event for evaluator results or failures. "
              : "Connect the backend to confirm the evaluator. "}
          Agent actions, tools, resources and notification deliveries are
          synthetic; gateway decisions, approval holds and state transitions
          execute in the backend.
        </p>
        <p>
          Data-risk scoring is not a production PII/DLP scanner. External
          agent-framework integration, real tool enforcement and automated CI/CD
          remain outside this POC.
        </p>
      </div>
    </section>
  );
}
