from sqlalchemy import select
from app.models.records import CapabilityEdge

def graph(db, agent_id):
    edges = list(db.scalars(select(CapabilityEdge).where(CapabilityEdge.agent_id == agent_id)))
    adjacency = {}
    for edge in edges:
        adjacency.setdefault(edge.source, []).append(edge)
    paths = []
    def visit(node, path, seen):
        for edge in adjacency.get(node, []):
            if edge.target in seen:
                continue
            next_path = path + [edge.target]
            if edge.dangerous:
                paths.append(next_path)
            visit(edge.target, next_path, seen | {edge.target})
    visit(agent_id, [agent_id], {agent_id})
    return {'agent_id': agent_id, 'edges': [{'id': e.id, 'source': e.source, 'target': e.target, 'dangerous': e.dangerous} for e in edges], 'dangerous_paths': paths, 'severity': 'CRITICAL' if paths else 'LOW'}

def evaluate(db, agent_id, tool):
    paths = [p for p in graph(db, agent_id)['dangerous_paths'] if tool in p[1:]]
    transitive = any(len(path) >= 4 for path in paths)
    reason = 'Unintended transitive capability: the requested tool can reach a protected write through intermediate tools.' if transitive else 'Dangerous capability path: the requested tool reaches a protected secret or write resource.'
    return {'dangerous': bool(paths), 'paths': paths, 'reason': reason if paths else None}
