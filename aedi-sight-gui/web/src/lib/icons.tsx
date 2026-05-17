// Reusable inline-SVG icon set — mirrors the legacy icons.js but as JSX.
// All icons use `currentColor` so the parent text color drives the fill.
import type { SVGProps } from "react";

const I = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
       strokeLinecap="round" strokeLinejoin="round" className={"icn " + (p.className || "")} {...p} />
);

export const Icon = {
  home: (p?: SVGProps<SVGSVGElement>) => (<I {...p}><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10.5V20h14v-9.5"/><path d="M10 20v-5h4v5"/></I>),
  provision: (p?: SVGProps<SVGSVGElement>) => (<I {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06A2 2 0 1 1 4.17 16.96l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 4.17l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06A2 2 0 0 1 19.83 7.04l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></I>),
  sink: (p?: SVGProps<SVGSVGElement>) => (<I {...p}><path d="M7 10h10"/><path d="M4 14h16"/><path d="M2 18h20"/><path d="M12 6v14"/><path d="M8 4l4-2 4 2"/></I>),
  viz: (p?: SVGProps<SVGSVGElement>) => (<I {...p}><path d="M3 12c2-4 4 4 6 0s4 4 6 0 4 4 6 0"/><path d="M3 18c2-2 4 2 6 0s4 2 6 0 4 2 6 0"/><path d="M3 6c2-2 4 2 6 0s4 2 6 0 4 2 6 0"/></I>),
  ml: (p?: SVGProps<SVGSVGElement>) => (<I {...p}><circle cx="7" cy="6" r="2"/><circle cx="7" cy="12" r="2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="9" r="2"/><circle cx="17" cy="15" r="2"/><path d="M9 6h6"/><path d="M9 12h6"/><path d="M9 18l6-3"/><path d="M9 12l6 3"/></I>),
  chat: (p?: SVGProps<SVGSVGElement>) => (<I {...p}><path d="M4 4h16v12H6l-2 3z"/><path d="M8 9h8"/><path d="M8 12h5"/></I>),
  tools: (p?: SVGProps<SVGSVGElement>) => (<I {...p}><path d="M14.7 6.3a4 4 0 1 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4L14.7 6.3z"/></I>),
  logs: (p?: SVGProps<SVGSVGElement>) => (<I {...p}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/></I>),
  updates: (p?: SVGProps<SVGSVGElement>) => (<I {...p}><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></I>),
  about: (p?: SVGProps<SVGSVGElement>) => (<I {...p}><circle cx="12" cy="12" r="9"/><path d="M11 12h1v5h1"/></I>),
  cpu: (p?: SVGProps<SVGSVGElement>) => (<I {...p}><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></I>),
  shield: (p?: SVGProps<SVGSVGElement>) => (<I {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></I>),
  radio: (p?: SVGProps<SVGSVGElement>) => (<I {...p}><circle cx="12" cy="12" r="2"/><path d="M8 8a5.66 5.66 0 0 0 0 8M16 8a5.66 5.66 0 0 1 0 8"/><path d="M5 5a11.31 11.31 0 0 0 0 14M19 5a11.31 11.31 0 0 1 0 14"/></I>),
};
export type IconName = keyof typeof Icon;
