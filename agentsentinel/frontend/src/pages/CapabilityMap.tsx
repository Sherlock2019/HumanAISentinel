import { useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Position,
} from "@xyflow/react";
import { Network, TriangleAlert, ArrowRight, CheckCircle2 } from "lucide-react";
import { api } from "../api/client";
import type { Agent } from "../types";
import { Panel, Empty } from "../components/ui";
interface Graph {
  agent_id: string;
  edges: { id: string; source: string; target: string; dangerous: boolean }[];
  dangerous_paths: string[][];
  severity: string;
}
export default function CapabilityMap({
  agents,
  initialAgent,
  onError,
}: {
  agents: Agent[];
  initialAgent?: string;
  onError: (message: string) => void;
}) {
  const [id, setId] = useState(initialAgent || "support-agent"),
    [graph, setGraph] = useState<Graph | null>(null),
    [selected, setSelected] = useState("");
  useEffect(() => {
    api<Graph>("/api/capabilities/" + id)
      .then(setGraph)
      .catch((e) => onError(e.message));
  }, [id, onError]);
  const depths: Record<string, number> = { [id]: 0 };
  if (graph) {
    for (let i = 0; i < graph.edges.length; i++)
      for (const e of graph.edges)
        if (depths[e.source] !== undefined && depths[e.target] === undefined)
          depths[e.target] = depths[e.source] + 1;
  }
  const counts: Record<number, number> = {};
  const names = [
    ...new Set([
      id,
      ...(graph?.edges.flatMap((e) => [e.source, e.target]) || []),
    ]),
  ];
  const dangerousNodes = new Set(graph?.dangerous_paths.flat() || []);
  const policy = agents.find((a) => a.id === id)?.policy;
  const nodes = names.map((name) => {
    const depth = depths[name] ?? 1,
      index = counts[depth] || 0;
    counts[depth] = index + 1;
    const danger = dangerousNodes.has(name) && name !== id;
    const review = policy?.require_approval.includes(name);
    return {
      id: name,
      position: { x: depth * 265, y: index * 110 },
      data: {
        label: (
          <div className="cap-node">
            <Network size={19} />
            <strong>
              {name === id ? agents.find((a) => a.id === id)?.name : name}
            </strong>
            <span>
              {name === id
                ? "Declared agent"
                : danger
                  ? "Risky reachability"
                  : review
                    ? "Requires approval"
                    : "Intended capability"}
            </span>
          </div>
        ),
      },
      style: {
        width: 220,
        borderRadius: 12,
        border: `1.5px solid ${danger ? "#dd6a73" : review ? "#dba857" : "#76b8a5"}`,
        background: danger ? "#fff2f3" : review ? "#fff9ee" : "#f0f8f5",
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });
  const edges =
    graph?.edges.map((e) => {
      const danger = graph.dangerous_paths.some((p) =>
        p.some((n, i) => n === e.source && p[i + 1] === e.target),
      );
      return {
        ...e,
        animated: danger,
        label: danger ? "dangerous path" : "permitted",
        style: {
          stroke: danger ? "#d74755" : "#65a994",
          strokeWidth: danger ? 2.5 : 1.5,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: danger ? "#d74755" : "#65a994",
        },
      };
    }) || [];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CAPABILITIES ARE MORE THAN A TOOL LIST</div>
          <h1>Capability map</h1>
          <p>
            Inspect what an agent can reach, including indirect paths through
            other tools.
          </p>
        </div>
        <select
          aria-label="Capability agent"
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            setSelected("");
          }}
        >
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      {graph?.dangerous_paths.length ? (
        <div className="danger-callout">
          <TriangleAlert size={25} />
          <div>
            <h3>Unintended capability path detected</h3>
            <p>
              A reachable tool chain exposes a protected operation. Sentinel
              blocks the entry point before any hop executes.
            </p>
          </div>
          <span className="badge critical">CRITICAL</span>
        </div>
      ) : (
        <div className="info-callout">
          <CheckCircle2 size={22} />
          No dangerous paths found in this agent’s seeded capability graph.
        </div>
      )}
      <Panel
        title="Reachable resources"
        subtitle="Green: intended · Amber: approval required · Red: dangerous reachability"
      >
        <div className="capability-flow">
          <ReactFlow
            key={id}
            nodes={nodes}
            edges={edges}
            fitView
            nodesDraggable={false}
            nodesConnectable={false}
            onNodeClick={(_, n) => setSelected(n.id)}
          >
            <Background gap={22} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        {selected && (
          <div className="selected-capability">
            <strong>{selected}</strong>
            <span>
              {dangerousNodes.has(selected)
                ? "This node lies on a dangerous reachability path."
                : "This node is within the intended capability graph."}
            </span>
          </div>
        )}
      </Panel>
      {graph?.dangerous_paths.map((path, i) => (
        <Panel key={i} title={`Detected path ${i + 1}`}>
          <div className="path-chain">
            {path.map((n, j) => (
              <span key={n}>
                {j > 0 && <ArrowRight size={18} />}
                <code>{n}</code>
              </span>
            ))}
          </div>
          <p className="footnote">
            {path.length > 3
              ? "The direct call looks permitted, but the transitive outcome crosses the resource boundary."
              : "This route targets a protected capability outside the agent’s purpose."}
          </p>
        </Panel>
      ))}
      {graph && !graph.edges.length && (
        <Empty
          title="No capability edges registered"
          text="This new agent has no predefined transitive graph; deterministic tool and resource policies still apply."
        />
      )}
    </>
  );
}
