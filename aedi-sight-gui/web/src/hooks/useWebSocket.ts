import { useEffect, useRef, useState } from "react";
import type { BusMessage } from "../types";

/** Unified /ws bus — same as the legacy wsbus.js. One connection, topic-routed. */
export function useWebSocket(): {
  connected: boolean;
  subscribe<T>(topic: string, fn: (m: BusMessage<T>) => void): () => void;
  send(topic: string, data: unknown): void;
} {
  const wsRef = useRef<WebSocket | null>(null);
  const handlers = useRef<Map<string, Set<(m: BusMessage<unknown>) => void>>>(new Map());
  const retry = useRef(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      wsRef.current = ws;
      ws.onopen = () => {
        if (cancelled) return;
        retry.current = 0;
        setConnected(true);
      };
      ws.onmessage = ev => {
        try {
          const msg = JSON.parse(ev.data) as BusMessage<unknown>;
          if (!msg.topic) return;
          handlers.current.get(msg.topic)?.forEach(fn => fn(msg));
          handlers.current.get("*")?.forEach(fn => fn(msg));
        } catch {}
      };
      ws.onclose = () => {
        setConnected(false);
        if (cancelled) return;
        const delay = Math.min(15000, 600 * ++retry.current);
        setTimeout(connect, delay);
      };
      ws.onerror = () => { try { ws.close(); } catch {} };
    };
    connect();
    return () => { cancelled = true; try { wsRef.current?.close(); } catch {} };
  }, []);

  function subscribe<T>(topic: string, fn: (m: BusMessage<T>) => void) {
    let set = handlers.current.get(topic);
    if (!set) { set = new Set(); handlers.current.set(topic, set); }
    set.add(fn as (m: BusMessage<unknown>) => void);
    return () => { set!.delete(fn as (m: BusMessage<unknown>) => void); };
  }

  function send(topic: string, data: unknown) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ topic, data }));
  }

  return { connected, subscribe, send };
}
