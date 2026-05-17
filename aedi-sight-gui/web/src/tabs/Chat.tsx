import { useEffect, useRef, useState } from "react";
import { useAppContext } from "../App";
import { api } from "../hooks/useApi";

interface Line { who: string; text: string; cls?: string }

export function Chat() {
  const { ws } = useAppContext();
  const [lines, setLines] = useState<Line[]>([
    { who: "aedi »", text: "Welcome. /help lists local commands; anything else is sent to claude-flow.", cls: "info" },
  ]);
  const [input, setInput] = useState("");
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [lines]);
  useEffect(() => ws.subscribe<{ line?: string; cls?: string }>("chat", m =>
    setLines(l => [...l, { who: "claude »", text: m.data.line || "", cls: m.data.cls || "info" }])
  ), [ws]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    setLines(l => [...l, { who: "you »", text, cls: "ok" }]);
    const endpoint = text.startsWith("/") ? "/api/chat" : "/api/chat/stream";
    try {
      const d = await api<{ lines?: string[]; reply?: string; streaming?: boolean }>("POST", endpoint, { text });
      if (d.lines) setLines(l => [...l, ...d.lines!.map(line => ({ who: "··", text: line }))]);
      if (d.reply) setLines(l => [...l, { who: "claude »", text: d.reply!, cls: "info" }]);
      if (d.streaming) setLines(l => [...l, { who: "··", text: "(streaming…)", cls: "info" }]);
    } catch (e) { setLines(l => [...l, { who: "!!", text: String(e), cls: "err" }]); }
  }

  return (
    <>
      <header className="tab-head"><h2>Chat</h2><p className="sub">Terminal-style. Bridges to <code>claude-flow</code> when <code>ANTHROPIC_API_KEY</code> is set; <code>/help</code>, <code>/ip</code>, <code>/ports</code>, <code>/fleet</code>, <code>/git status</code> work offline.</p></header>
      <div className="terminal">
        <pre ref={logRef} className="log term">
          {lines.map((l, i) => <div key={i}><span className={l.cls}>{l.who}</span> <span>{l.text}</span></div>)}
        </pre>
        <form onSubmit={submit} className="chat-form">
          <span className="prompt">aedi&nbsp;»</span>
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="ask Claude or run a /command — /help" autoComplete="off" />
          <button className="btn xs primary" type="submit">send</button>
        </form>
      </div>
    </>
  );
}
