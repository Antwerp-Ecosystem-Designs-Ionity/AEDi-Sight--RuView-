import { useCallback, useEffect, useRef, useState } from "react";

/** Polled GET — re-fetches every `intervalMs` while active. */
export function usePolled<T>(url: string, intervalMs = 2000, active = true): {
  data: T | null; error: Error | null; refresh: () => Promise<void>;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const j = (await r.json()) as T;
      if (aliveRef.current) { setData(j); setError(null); }
    } catch (e) {
      if (aliveRef.current) setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [url]);

  useEffect(() => {
    aliveRef.current = true;
    if (!active) return () => { aliveRef.current = false; };
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => { aliveRef.current = false; clearInterval(id); };
  }, [refresh, intervalMs, active]);

  return { data, error, refresh };
}

/** One-shot fetcher, fires on demand. */
export async function api<T>(method: "GET" | "POST", url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<T>;
}
