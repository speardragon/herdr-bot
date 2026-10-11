import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.tsx";
import { applyThemeAttribute } from "./data/hooks/useTheme.ts";
import "./styles/reset.css";
import "./styles/tokens.css";

async function resolveBridge() {
  const isDemo = new URLSearchParams(window.location.search).has("demo");
  if (!isDemo && window.herdrBot != null) return window.herdrBot;
  const { createFakeBridge } = await import("./dev/fake-bridge.ts");
  return createFakeBridge();
}

async function main() {
  const bridge = await resolveBridge();
  // Set before the first paint (no flash of the wrong theme) -- mirrors what a real preload-backed
  // app gets "for free" from `theme.initial` being read synchronously at preload load.
  applyThemeAttribute(bridge.theme.initial.resolved);

  const root = document.getElementById("root");
  if (root == null) throw new Error("#root missing from index.html");

  createRoot(root).render(
    <StrictMode>
      <App bridge={bridge} />
    </StrictMode>,
  );
}

void main();
