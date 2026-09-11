import { useEffect, useState } from "react";
import type { DesktopBridge } from "../recovered/contracts/desktop-bridge";
import { OverlayDialog } from "../recovered/ui/overlay-primitives";
import { setLocale, t, useLocale } from "./locale";

export function LocalSettings({ bridge, onClose }: { bridge: DesktopBridge; onClose(): void }) {
  const locale = useLocale();
  const [theme, setTheme] = useState(bridge.theme.initial.resolved);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let active = true;
    void bridge.theme.get().then((state) => { if (active) setTheme(state.resolved); }).catch((cause: unknown) => { if (active) setError(String(cause)); });
    const unsubscribe = bridge.theme.onChanged((state) => setTheme(state.resolved));
    return () => { active = false; unsubscribe(); };
  }, [bridge]);
  return <OverlayDialog open onClose={onClose} label={t("Settings")} panelStyle={{ width: "min(420px, calc(100vw - 32px))", padding: 24, background: "var(--cursor-bg-elevated)", color: "var(--cursor-text-primary)", border: "1px solid var(--cursor-stroke-secondary)", borderRadius: 16, boxShadow: "0 16px 64px #0005" }}>
    <div className="hb-settings-heading"><h2>{t("Settings")}</h2><button onClick={onClose} aria-label={t("Close")} type="button">×</button></div>
    <label className="hb-settings-row">{t("Language")}<select value={locale} onChange={(event) => setLocale(event.target.value === "en" ? "en" : "ko")}><option value="ko">한국어</option><option value="en">English</option></select></label>
    <label className="hb-settings-row">{t("Appearance")}<select disabled={pending} value={theme} onChange={(event) => {
      const next = event.target.value === "dark" ? "dark" : "light";
      setPending(true); setError("");
      void bridge.theme.set(next).then((state) => setTheme(state.resolved)).catch((cause: unknown) => setError(String(cause))).finally(() => setPending(false));
    }}><option value="light">{t("Light")}</option><option value="dark">{t("Dark")}</option></select></label>
    {error ? <p role="alert">{error}</p> : null}
  </OverlayDialog>;
}
