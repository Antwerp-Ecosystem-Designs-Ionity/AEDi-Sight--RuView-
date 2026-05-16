import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("react-root");
if (!root) {
  throw new Error("missing <div id=\"react-root\"> mount point");
}
createRoot(root).render(<StrictMode><App /></StrictMode>);
