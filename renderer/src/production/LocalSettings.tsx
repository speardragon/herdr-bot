import { useEffect, useState } from "react";
import type { DesktopBridge } from "../recovered/contracts/desktop-bridge";
import { OverlayDialog } from "../recovered/ui/overlay-primitives";
import { SandSelect } from "../recovered/ui/sand-floating-primitives";
import { SandIconButton } from "../recovered/ui/sand-kit-primitives";
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
    <div className="hb-settings-heading"><h2>{t("Settings")}</h2><SandIconButton aria-label={t("Close")} icon="close" label={t("Close")} onClick={onClose} size="sm" /></div>
    <label className="hb-settings-row"><span>{t("Language")}</span><SandSelect ariaLabel={t("Language")} className="ui-select-trigger" onValueChange={(next) => setLocale(next)} options={[{ value: "ko" as const, label: "한국어" }, { value: "en" as const, label: "English" }]} value={locale} /></label>
    <label className="hb-settings-row"><span>{t("Appearance")}</span><SandSelect ariaLabel={t("Appearance")} className="ui-select-trigger" disabled={pending} onValueChange={(next) => {
      setPending(true); setError("");
      void bridge.theme.set(next).then((state) => setTheme(state.resolved)).catch((cause: unknown) => setError(String(cause))).finally(() => setPending(false));
    }} options={[{ value: "light" as const, label: t("Light") }, { value: "dark" as const, label: t("Dark") }]} value={theme} /></label>
    {error ? <p role="alert">{error}</p> : null}
  </OverlayDialog>;
}
