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
        let msg: BusMessage<unknown>;
        try { msg = JSON.parse(ev.data) as BusMessage<unknown>; } catch { return; }
        if (!msg.topic) return;
        // Each subscriber gets isolated error handling — a throw in one
        // handler must not stop the rest of the message fan-out. Note: we
        // intentionally do NOT include the WebSocket-supplied topic string
        // in the log message (CodeQL js/log-injection). The Error object
        // itself is the only thing surfaced.
        const dispatch = (fn: (m: BusMessage<unknown>) => void) => {
          try { fn(msg); }
          catch (e) { console.error("[wsbus] handler error", e); }
        };
        handlers.current.get(msg.topic)?.forEach(dispatch);
        handlers.current.get("*")?.forEach(dispatch);
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
