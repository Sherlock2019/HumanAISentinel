import { useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Position,
} from "@xyflow/react";
import {
  Bot,
  ShieldCheck,
  FileCheck2,
  Brain,
  Activity,
  Scale,
  UserCheck,
  Workflow,
  Lock,
  Bell,
  ScrollText,
  ArrowRight,
  Check,
  ChevronRight,
  Play,
  Eye,
  Shield,
  Users,
  Database,
  Hand,
  Network,
  Crosshair,
  ArrowDown,
} from "lucide-react";
import "../components/intent.css";
import type { LucideIcon } from "lucide-react";
import { Panel, Badge } from "../components/ui";
import { JuryWorkflow, WhatMakesItWork } from "../components/JuryOverview";
const explanations: Record<
  string,
  {
    title: string;
    icon: LucideIcon;
    what: string;
    why: string;
    input: string;
    output: string;
    example: string;
  }
> = {
  agent: {
    title: "AI Agent",
    icon: Bot,
    what: "Proposes an action to accomplish a user task.",
    why: "The agent’s plan can be mistaken or influenced by untrusted content.",
    input: "User request and task context.",
    output: "A proposed tool call, resource and operation.",
    example: "CodingAgent receives “Review this application source code.”",
  },
  gateway: {
    title: "Sentinel Gateway",
    icon: ShieldCheck,
    what: "Intercepts every simulated tool call before execution.",
    why: "A safety decision must happen before an action can affect a resource.",
    input: "Agent identity, task, tool, resource and arguments.",
    output: "A recorded ALLOW, REVIEW or BLOCK decision.",
    example: "The gateway holds read_prod_secret while safety checks run.",
  },
  policy: {
    title: "Policy Engine",
    icon: FileCheck2,
    what: "Checks exact rules for tools, resources, network destinations and limits.",
    why: "Permissions must be defined independently of the AI model.",
    input: "The agent’s registered policy and proposed action.",
    output: "Deterministic allow, approval requirement or deny.",
    example:
      "CustomerSupportAgent may search_kb and create_ticket. It may never execute_shell, read_secret or modify_iam. DENY always wins.",
  },
  llm: {
    title: "LLM Safety Judge",
    icon: Brain,
    what: "Checks whether the action makes sense for the original task.",
    why: "An individually permitted action may still be semantically unsafe.",
    input: "Purpose, original request, plan, action and recent history.",
    output: "Structured intent, data, injection and privilege risk scores.",
    example:
      "Reading an AWS token is unnecessary for code review. Mock mode gives a deterministic explanation.",
  },
  behavior: {
    title: "Behavior Monitor",
    icon: Activity,
    what: "Detects unusual rate, repeated denials, loops and sudden cost spikes.",
    why: "A sequence can reveal risk that a single action hides.",
    input: "Actions and synthetic costs from the previous 60 seconds.",
    output: "An anomaly score and human-readable signals.",
    example:
      "Three blocked retries in 60 seconds trigger automatic quarantine.",
  },
  intent: {
    title: "Intent Engine",
    icon: Crosshair,
    what: "Intent Engine evaluates the sequence of actions across the entire agent session rather than judging only the current tool call.",
    why: "One tool call may look harmless. The sequence may not.",
    input: "Declared purpose, user objective, the last 20 session actions, denials, retries and the proposed action.",
    output: "Predicted intent, confidence, purpose alignment, intent drift, session risk and likely next step.",
    example:
      "list_files → read_config → read_env is each permitted, but the sequence predicts credential discovery and is sent to review before read_secret.",
  },
  risk: {
    title: "Risk & Decision Engine",
    icon: Scale,
    what: "Combines policy, semantic, behavior, sensitivity and reversibility signals.",
    why: "Each decision needs a consistent, explainable basis.",
    input: "Independent safety checks and containment thresholds.",
    output: "A risk score from 0–100 and a final decision.",
    example:
      "Critical secret access imposes a risk floor of 98. Model advice cannot override an explicit deny.",
  },
  human: {
    title: "Human Approval",
    icon: UserCheck,
    what: "Keeps a proposed action pending until an administrator approves or rejects it.",
    why: "High-impact authorized actions need a named human decision.",
    input: "A REVIEW event and its evidence.",
    output: "A separately audited approval or rejection.",
    example:
      "FinanceAgent can prepare a payment request only after approval. Current policy is checked again before execution.",
  },
  tool: {
    title: "Tool / API / MCP",
    icon: Workflow,
    what: "Executes the synthetic tool only after authorization.",
    why: "The execution boundary makes enforcement real and testable.",
    input: "An ALLOW or valid human approval.",
    output: "A sandbox receipt; no real infrastructure changes.",
    example:
      "search_kb returns a synthetic result. A blocked secret read produces no tool receipt.",
  },
  quarantine: {
    title: "Quarantine",
    icon: Lock,
    what: "Contains the agent, revokes its demo session and cancels pending actions.",
    why: "An unsafe agent must not continue trying other routes.",
    input: "A critical violation or repeated blocked actions.",
    output: "QUARANTINED state and future execution locked.",
    example:
      "CodingAgent’s secret attempt is blocked; subsequent requests cannot execute until an admin restores it.",
  },
  alerts: {
    title: "Alert Center",
    icon: Bell,
    what: "Shows who attempted what, why it was unsafe and what Sentinel did.",
    why: "People need actionable evidence to investigate and respond.",
    input: "Blocked and review events.",
    output: "Dashboard alert and simulated notification payloads.",
    example:
      "An admin investigates a critical secret event, acknowledges it and keeps the agent quarantined.",
  },
  audit: {
    title: "Audit Evidence",
    icon: ScrollText,
    what: "Preserves the request, checks, decision and human response in a hash chain.",
    why: "A security decision needs traceable evidence.",
    input: "Every runtime decision, policy change and admin action.",
    output: "Exportable JSON/CSV and a verifiable evidence chain.",
    example:
      "The blocked tool, risk 98, quarantine state and simulated alert are preserved together.",
  },
};
const positions: Record<string, { x: number; y: number }> = {
  agent: { x: 0, y: 158 },
  gateway: { x: 190, y: 158 },
  policy: { x: 405, y: 5 },
  llm: { x: 405, y: 158 },
  behavior: { x: 405, y: 310 },
  intent: { x: 405, y: 460 },
  risk: { x: 645, y: 158 },
  human: { x: 880, y: 5 },
  tool: { x: 1090, y: 80 },
  quarantine: { x: 880, y: 310 },
  alerts: { x: 1090, y: 310 },
  audit: { x: 645, y: 460 },
};
const links = [
  ["agent", "gateway", "action", "base"],
  ["gateway", "policy", "", "base"],
  ["gateway", "llm", "", "base"],
  ["gateway", "behavior", "", "base"],
  ["policy", "risk", "", "base"],
  ["llm", "risk", "", "base"],
  ["behavior", "risk", "", "base"],
  ["gateway", "intent", "session", "base"],
  ["intent", "risk", "", "base"],
  ["risk", "tool", "ALLOW", "allow"],
  ["risk", "human", "REVIEW", "review"],
  ["human", "tool", "approved", "review"],
  ["risk", "quarantine", "critical BLOCK", "block"],
  ["quarantine", "alerts", "notify", "block"],
  ["gateway", "audit", "preserve evidence", "base"],
];
export default function HowItWorks({
  onDemo,
  provider,
  onCommit,
}: {
  onDemo: () => void;
  provider?: string;
  onCommit: () => void;
}) {
  const [selected, setSelected] = useState("gateway"),
    [path, setPath] = useState("all"),
    [architecture, setArchitecture] = useState(false);
  const info = explanations[selected];
  const Icon = info.icon;
  const nodes = Object.entries(explanations).map(([id, e]) => ({
    id,
    position: positions[id],
    data: {
      label: (
        <div className="architecture-node">
          <e.icon size={21} />
          <strong>{e.title}</strong>
          <span>
            {id === "gateway"
              ? "Before execution"
              : id === "risk"
                ? "Allow · Review · Block"
                : "Click to explore"}
          </span>
        </div>
      ),
    },
    style: {
      width: 175,
      border: selected === id ? "2px solid #258a78" : "1px solid #dae2e8",
      borderRadius: 12,
      background: selected === id ? "#edf8f4" : "white",
      boxShadow: "0 3px 12px #152b4210",
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  }));
  const edges = links.map(([source, target, label, type], i) => {
    const color =
      type === "allow"
        ? "#218f72"
        : type === "review"
          ? "#ce8a17"
          : type === "block"
            ? "#d8424f"
            : "#a5b4c2";
    return {
      id: `edge-${i}`,
      source,
      target,
      label,
      animated: type === path,
      style: {
        stroke: color,
        strokeWidth: type === "base" ? 1.5 : 2.5,
        opacity: path === "all" || type === path || type === "base" ? 1 : 0.16,
      },
      markerEnd: { type: MarkerType.ArrowClosed, color },
      labelStyle: { fill: color, fontSize: 11, fontWeight: 700 },
      labelBgPadding: [5, 3] as [number, number],
    };
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE IDEA IN TWO MINUTES</div>
          <h1>How AgentSentinel protects AI agents</h1>
          <p>
            Every important agent action is checked before it reaches the real
            world.
          </p>
        </div>
        <button className="primary" onClick={onDemo}>
          <Play size={16} />
          See it in action
        </button>
      </div>
      <div className="explain-shortcuts" aria-label="Presentation sections">
        <button
          className="secondary"
          onClick={() =>
            document
              .getElementById("jury-workflow")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          1 · The workflow <ArrowRight size={15} />
        </button>
        <button
          className="secondary"
          onClick={() =>
            document
              .getElementById("jury-components")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          2 · What Makes It Work <ArrowRight size={15} />
        </button>
        <span>Understand the idea, then run the proof.</span>
        <button className="secondary" onClick={onCommit}>
          Explore GitHub Integration <ArrowRight size={15} />
        </button>
      </div>
      <div className="explain-hero">
        <div>
          <span className="eyebrow">THE PROBLEM</span>
          <h2>
            An agent can understand a task.
            <br />
            And still take an unsafe action.
          </h2>
          <p>
            A malicious document, a mistaken plan or an unexpected tool chain
            can turn “review this code” into “read a production secret.”
            AgentSentinel sits between the agent and its tools, making
            permissions enforceable at runtime.
          </p>
        </div>
        <div className="before-after">
          <div>
            <span>Without a gateway</span>
            <p>
              <Bot size={20} />
              Agent
              <ArrowRight size={17} />
              <Workflow size={20} />
              Tool
            </p>
            <small className="text-red">
              Action executes before anyone can intervene.
            </small>
          </div>
          <div className="protected">
            <span>With AgentSentinel</span>
            <p>
              <Bot size={20} />
              Agent
              <ArrowRight size={17} />
              <ShieldCheck size={23} />
              Check
              <ArrowRight size={17} />
              <Workflow size={20} />
              Tool
            </p>
            <small className="text-green">
              Only an authorized action can execute.
            </small>
          </div>
        </div>
      </div>
      <JuryWorkflow />
      <WhatMakesItWork provider={provider} />
      <details
        className="technical-disclosure"
        onToggle={(e) => setArchitecture(e.currentTarget.open)}
      >
        <summary>
          <Network size={22} />
          <span>
            <strong>Explore the technical architecture</strong>
            <small>
              Optional: click the components and trace ALLOW, REVIEW and BLOCK
              paths.
            </small>
          </span>
        </summary>
        {architecture && (
          <Panel
            title="Inside the safety gateway"
            subtitle="Click any component to understand its role. Trace one path at a time."
            action={
              <div className="segmented">
                {["all", "allow", "review", "block"].map((p) => (
                  <button
                    key={p}
                    className={path === p ? "selected" : ""}
                    onClick={() => setPath(p)}
                  >
                    {p === "all" ? "All paths" : p.toUpperCase()}
                  </button>
                ))}
              </div>
            }
          >
            <div className="architecture-layout">
              <div className="architecture-flow">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  fitView
                  fitViewOptions={{ padding: 0.12 }}
                  onNodeClick={(_, n) => setSelected(n.id)}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  minZoom={0.3}
                  maxZoom={1.5}
                >
                  <Background color="#dce4eb" gap={22} />
                  <Controls showInteractive={false} />
                </ReactFlow>
                <div className="flow-caption">
                  Agent → Gateway → Safety checks → Decision → Authorized
                  execution or containment
                </div>
              </div>
              <aside className="node-explanation">
                <div className="node-explanation-heading">
                  <span className="node-icon">
                    <Icon size={24} />
                  </span>
                  <div>
                    <span className="eyebrow">SELECTED COMPONENT</span>
                    <h3>{info.title}</h3>
                  </div>
                </div>
                {[
                  ["What it does", info.what],
                  ["Why it exists", info.why],
                  ["Input", info.input],
                  ["Output", info.output],
                  ["Example", info.example],
                ].map(([title, text]) => (
                  <div key={title}>
                    <h4>{title}</h4>
                    <p>{text}</p>
                  </div>
                ))}
              </aside>
            </div>
          </Panel>
        )}
      </details>
      <Panel
        title="Same agent. Different intent."
        subtitle="The signature incident: a code review turns into a secret access attempt."
      >
        <div className="intent-comparison">
          <div>
            <span className="eyebrow">WHAT IT WAS SUPPOSED TO DO</span>
            <Bot size={28} />
            <h3>Review application code</h3>
            <p>Read the repository, run tests and suggest patches.</p>
            <div className="mini-tags">
              <span>
                <Check size={13} />
                read_repo
              </span>
              <span>
                <Check size={13} />
                run_tests
              </span>
            </div>
          </div>
          <div className="intent-arrow">
            <ArrowRight size={27} />
            <span>Intent mismatch</span>
          </div>
          <div className="unsafe">
            <span className="eyebrow">WHAT IT TRIED TO DO</span>
            <Lock size={28} />
            <h3>Read a production credential</h3>
            <p>
              <code>read_prod_secret("AWS_PRODUCTION_TOKEN")</code>
            </p>
            <Badge value="CRITICAL" />
          </div>
          <div className="intent-result">
            <span>FINAL RISK</span>
            <strong>
              98<small>/100</small>
            </strong>
            <Badge value="BLOCK" />
            <p>
              Tool stopped
              <br />
              Agent quarantined
              <br />
              Administrator alerted
            </p>
          </div>
        </div>
      </Panel>
      <Panel
        title="Thread-aware protection: Intent Sentinel"
        subtitle="Guard the session, not just the tool call."
      >
        <div className="how-intent">
          <div>
            <span className="eyebrow">INTENT ENGINE</span>
            <h2>
              One tool call may look harmless.
              <br />
              The sequence may not.
            </h2>
            <p>
              Intent Engine evaluates the sequence of actions across the entire
              agent session rather than judging only the current tool call. It
              compares what the agent was asked to do with what it has already
              done, what it is trying to do now and what it may try next.
            </p>
            <p>
              The result is a <b>predicted intent</b> with a confidence, never a
              claim about hidden intent. It is one risk signal: deterministic
              policy and observed actions stay authoritative, and a prediction
              alone escalates to human review, not to a block.
            </p>
            <div className="how-intent-phrase">
              GUARD THE SESSION, NOT JUST THE TOOL CALL.
            </div>
          </div>
          <div className="intent-arch" aria-label="Session-aware architecture">
            <span className="intent-arch-core">Agent session</span>
            <ArrowDown size={16} />
            <div className="intent-arch-row">
              <span>Current action</span>
              <span>Session history</span>
            </div>
            <ArrowDown size={16} />
            <span className="intent-arch-core">
              <Crosshair size={15} /> Intent Engine
            </span>
            <ArrowDown size={16} />
            <div className="intent-arch-row">
              <span>Predicted objective</span>
              <span>Intent drift</span>
              <span>Possible next step</span>
            </div>
            <ArrowDown size={16} />
            <span className="intent-arch-core risk">Risk Engine</span>
          </div>
        </div>
      </Panel>
      <div className="explain-section-title">
        <span className="eyebrow">WHY YOU CAN TRUST THE DECISION</span>
        <h2>Models propose. Policy enforces. Humans stay accountable.</h2>
      </div>
      <div className="principles-grid">
        {[
          [
            Shield,
            "Least privilege",
            "Give an agent only the capabilities its purpose requires.",
          ],
          [
            Lock,
            "Default deny",
            "Unknown tools and resources never receive automatic access.",
          ],
          [
            Users,
            "Human accountability",
            "High-impact actions wait for an explicit human decision.",
          ],
          [
            Brain,
            "Separate policy from model",
            "The LLM can flag risk, but cannot grant permissions or override a deny.",
          ],
          [
            Database,
            "Audit everything",
            "Decisions and admin actions leave traceable, exportable evidence.",
          ],
          [
            Hand,
            "Fail safe",
            "An unavailable safety evaluator sends actions to review or blocks them.",
          ],
        ].map(([I, title, text]) => {
          const C = I as LucideIcon;
          return (
            <Panel key={String(title)}>
              <C size={23} />
              <h3>{String(title)}</h3>
              <p>{String(text)}</p>
            </Panel>
          );
        })}
      </div>
      <div className="jury-callout">
        <Eye size={27} />
        <div>
          <h3>What this POC proves</h3>
          <p>
            Enforcement before execution. Deterministic deny precedence. Real
            state transitions. Human approval. A visible evidence trail.
          </p>
          <small>
            All tools, resources, attacks and notification deliveries are
            synthetic. Mock mode runs locally without API keys.
          </small>
        </div>
        <button className="primary" onClick={onDemo}>
          Run the guided proof
          <ChevronRight size={17} />
        </button>
      </div>
    </>
  );
}
