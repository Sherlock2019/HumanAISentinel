import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { Agent, Alert, Metrics, SentinelEvent, Settings } from "../types";
export function useSentinel() {
  const [agents, setAgents] = useState<Agent[]>([]),
    [events, setEvents] = useState<SentinelEvent[]>([]),
    [alerts, setAlerts] = useState<Alert[]>([]),
    [metrics, setMetrics] = useState<Metrics | null>(null),
    [settings, setSettings] = useState<Settings | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [a, e, l, m, s] = await Promise.all([
        api<Agent[]>("/api/agents"),
        api<SentinelEvent[]>("/api/events"),
        api<Alert[]>("/api/alerts"),
        api<Metrics>("/api/metrics"),
        api<Settings>("/api/system/settings"),
      ]);
      setAgents(a);
      setEvents(e);
      setAlerts(l);
      setMetrics(m);
      setSettings(s);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 4000);
    return () => clearInterval(timer);
  }, [refresh]);
  return { agents, events, alerts, metrics, settings, error, loading, refresh };
}
