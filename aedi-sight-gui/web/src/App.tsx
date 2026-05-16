import { useEffect, useState, useMemo, createContext, useContext } from "react";
import { usePolled } from "./hooks/useApi";
import { useWebSocket } from "./hooks/useWebSocket";
import type { Status } from "./types";
import { Icon, type IconName } from "./lib/icons";
import { Intro } from "./components/Intro";
import { Header } from "./components/Header";

import { Home }        from "./tabs/Home";
import { Services }    from "./tabs/Services";
import { Provision }   from "./tabs/Provision";
import { Sink }        from "./tabs/Sink";
import { Visualizer }  from "./tabs/Visualizer";
import { MLVitals }    from "./tabs/MLVitals";
import { Chat }        from "./tabs/Chat";
import { Tools }       from "./tabs/Tools";
import { Logs }        from "./tabs/Logs";
import { Updates }     from "./tabs/Updates";
import { Libraries }   from "./tabs/Libraries";
import { RuView }      from "./tabs/RuView";
import { Debug }       from "./tabs/Debug";
import { About }       from "./tabs/About";

export type TabId =
  | "home" | "services" | "provision" | "sink" | "visualizer" | "ml" | "debug" | "chat"
  | "libs" | "ruview" | "tools" | "logs" | "updates" | "about";

interface TabDef { id: TabId; label: string; icon: IconName; group: "operate" | "explore" | "manage"; element: JSX.Element }
const tabs: TabDef[] = [
  { id: "home",       label: "Overview",    icon: "home",      group: "operate", element: <Home /> },
  { id: "services",   label: "Services",    icon: "cpu",       group: "operate", element: <Services /> },
  { id: "provision",  label: "Provision",   icon: "provision", group: "operate", element: <Provision /> },
  { id: "sink",       label: "Sink",        icon: "sink",      group: "operate", element: <Sink /> },
  { id: "visualizer", label: "Visualizer",  icon: "viz",       group: "operate", element: <Visualizer /> },
  { id: "ml",         label: "ML · Vitals", icon: "ml",        group: "operate", element: <MLVitals /> },
  { id: "debug",      label: "Debug",       icon: "cpu",       group: "operate", element: <Debug /> },
  { id: "chat",       label: "Chat",        icon: "chat",      group: "operate", element: <Chat /> },
  { id: "libs",       label: "Libraries",   icon: "shield",    group: "explore", element: <Libraries /> },
  { id: "ruview",     label: "RuView",      icon: "radio",     group: "explore", element: <RuView /> },
  { id: "tools",      label: "Tools",       icon: "tools",     group: "explore", element: <Tools /> },
  { id: "logs",       label: "Logs",        icon: "logs",      group: "manage",  element: <Logs /> },
  { id: "updates",    label: "Updates",     icon: "updates",   group: "manage",  element: <Updates /> },
  { id: "about",      label: "About",       icon: "about",     group: "manage",  element: <About /> },
];

interface AppContextValue {
  status: Status | null;
  ws: ReturnType<typeof useWebSocket>;
}
export const AppCtx = createContext<AppContextValue>({
  status: null,
  ws: { connected: false, subscribe: () => () => {}, send: () => {} },
});
export const useAppContext = () => useContext(AppCtx);

export function App() {
  const ws = useWebSocket();
  const { data: status } = usePolled<Status>("/api/status", 2000, true);
  const [tab, setTab] = useState<TabId>(() => (location.hash.slice(1) || "home") as TabId);

  useEffect(() => {
    const onHash = () => setTab(((location.hash.slice(1) || "home") as TabId));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => { if (location.hash !== "#" + tab) location.hash = tab; }, [tab]);

  const nodesSeen = status?.nodes_seen ?? 0;
  const ctxValue = useMemo<AppContextValue>(() => ({ status, ws }), [status, ws]);

  return (
    <AppCtx.Provider value={ctxValue}>
      <Intro />
      <Header status={status} wsConnected={ws.connected} />
      <aside className="app-sidebar">
        <ul className="side-tabs">
          {(["operate", "explore", "manage"] as const).map(group => (
            <Group key={group} name={group} items={tabs.filter(t => t.group === group)}
                   current={tab} setTab={setTab} nodesSeen={nodesSeen} />
          ))}
        </ul>
        <div className="side-foot">
          <Row lbl="esp32"   v={status?.esp32_serial ?? "—"} />
          <Row lbl="ws bus"  v={ws.connected ? "live" : "idle"} />
          <Row lbl="uptime"  v={formatUptime(status?.uptime_s ?? 0)} />
        </div>
      </aside>
      <main className="app-main">
        {tabs.map(t => (
          <section key={t.id} className={"tab" + (t.id === tab ? " is-active" : "")} data-tab={t.id}>
            {t.element}
          </section>
        ))}
      </main>
    </AppCtx.Provider>
  );
}

function Group({ name, items, current, setTab, nodesSeen }: {
  name: "operate" | "explore" | "manage";
  items: TabDef[];
  current: TabId;
  setTab: (id: TabId) => void;
  nodesSeen: number;
}) {
  return (
    <>
      <li className="sect">{name}</li>
      {items.map(t => {
        const I = Icon[t.icon];
        const badge = t.id === "provision" && nodesSeen > 0
          ? <span className="badge on">{nodesSeen}/8</span>
          : <span className="badge"></span>;
        return (
          <li key={t.id} className={current === t.id ? "is-active" : ""} onClick={() => setTab(t.id)}>
            <I />
            <span>{t.label}</span>
            {badge}
          </li>
        );
      })}
    </>
  );
}

function Row({ lbl, v }: { lbl: string; v: string }) {
  return <div className="side-foot-row"><span className="lbl">{lbl}</span><span>{v}</span></div>;
}
function formatUptime(s: number) {
  s = Math.floor(s);
  const h = (s / 3600) | 0, m = ((s % 3600) / 60) | 0, ss = s % 60;
  return `${h}h${String(m).padStart(2, "0")}m${String(ss).padStart(2, "0")}s`;
}
