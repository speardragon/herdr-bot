import { useEffect, useState } from "react";
import { useBridge } from "../../data/BridgeContext.tsx";
import { useSettings } from "../../data/hooks/useSettings.ts";
import { useTheme } from "../../data/hooks/useTheme.ts";
import type { UpdateStatus } from "../../data/bridge.ts";
import type { Terminal } from "../../data/types.ts";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { Button, Select } from "../../primitives/index.ts";
import { DirectoryField } from "./DirectoryField.tsx";
import styles from "./SettingsDialog.module.css";

/** The Settings dialog: Language, Appearance, Defaults, and app version + "Check for updates" (there's
 * no env var to force an update-available state for testing, so this was added as a deliberate
 * addition). Every field commits immediately -- there is no Save button. */
export function SettingsDialog() {
  const bridge = useBridge();
  const { locale, setLocale } = useT();
  const theme = useTheme();
  const { settings, update } = useSettings();
  const { t } = useT();

  const [version, setVersion] = useState<string | null>(null);
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    void bridge.version.get().then(setVersion);
    void bridge.version.update.getStatus().then(setStatus);
    return bridge.version.update.onStatusChanged(setStatus);
  }, [bridge]);

  async function checkForUpdates() {
    setChecking(true);
    try {
      setStatus(await bridge.version.update.check());
    } finally {
      setChecking(false);
    }
  }

  const state = status?.state ?? null;

  return (
    <div className={styles["hb-settings"]}>
      <Select
        layout="inline"
        label={t("dialogs.settings.language")}
        value={locale}
        onChange={(value) => setLocale(value as "en" | "ko")}
        options={[
          { value: "en", label: "English" },
          { value: "ko", label: "한국어" },
        ]}
      />
      <Select
        layout="inline"
        label={t("dialogs.settings.appearance")}
        value={theme.preference === "dark" ? "dark" : "light"}
        onChange={(value) => theme.setPreference(value as "light" | "dark")}
        options={[
          { value: "light", label: t("dialogs.settings.appearance.light") },
          { value: "dark", label: t("dialogs.settings.appearance.dark") },
        ]}
      />

      <div className={styles["hb-settings-section-header"]}>{t("dialogs.settings.defaults")}</div>

      <DirectoryField
        label={t("dialogs.settings.defaultWorkingFolder")}
        value={settings?.defaultWorkingFolder ?? ""}
        placeholder={t("dialogs.settings.defaultWorkingFolderPlaceholder")}
        onChange={(value) => void update({ defaultWorkingFolder: value.length > 0 ? value : null })}
      />
      <p className={styles["hb-settings-help"]}>{t("dialogs.settings.defaultWorkingFolderHelp")}</p>

      <Select
        layout="inline"
        label={t("dialogs.settings.defaultProvider")}
        value={settings?.defaultProvider ?? ""}
        onChange={(value) => void update({ defaultProvider: value.length > 0 ? value : null })}
        options={[
          { value: "", label: t("dialogs.new.model.default") },
          { value: "claude", label: "Claude Code" },
          { value: "codex", label: "Codex" },
          { value: "grok", label: "Grok CLI" },
          { value: "gemini", label: "Gemini CLI" },
          { value: "opencode", label: "OpenCode" },
        ]}
      />
      <Select
        layout="inline"
        label={t("dialogs.settings.defaultPermissionMode")}
        value={settings?.defaultPermissionMode ?? ""}
        onChange={(value) => void update({ defaultPermissionMode: value.length > 0 ? (value as "ask" | "auto") : null })}
        options={[
          { value: "", label: t("dialogs.new.permissions.agentDefault") },
          { value: "ask", label: t("dialogs.new.permissions.ask") },
          { value: "auto", label: t("dialogs.new.permissions.auto") },
        ]}
      />
      <Select
        layout="inline"
        label={t("dialogs.settings.terminal")}
        value={settings?.terminal ?? ""}
        onChange={(value) => void update({ terminal: value.length > 0 ? (value as Terminal) : null })}
        options={[
          { value: "", label: t("dialogs.settings.terminal.auto") },
          { value: "kaku", label: "Kaku" },
          { value: "wezterm", label: "WezTerm" },
          { value: "ghostty", label: "Ghostty" },
          { value: "iterm", label: "iTerm2" },
          { value: "terminal", label: "Terminal" },
        ]}
      />
      <p className={styles["hb-settings-help"]}>{t("dialogs.settings.terminalHelp")}</p>

      <div className={styles["hb-settings-version-row"]}>
        <span>{t("dialogs.settings.version", { version: version ?? "…" })}</span>
        <UpdateControl state={state} checking={checking} onCheck={checkForUpdates} onInstall={() => void bridge.version.update.install()} />
      </div>
      {state?.type === "available" && state.installError != null && (
        <p className={styles["hb-settings-help"]}>{t("dialogs.settings.updateFailed", { message: state.installError })}</p>
      )}
    </div>
  );
}

interface UpdateControlProps {
  readonly state: UpdateStatus["state"] | null;
  readonly checking: boolean;
  readonly onCheck: () => void;
  readonly onInstall: () => void;
}

/** The version row's right side: check, install a newer version, or that install's progress. */
function UpdateControl({ state, checking, onCheck, onInstall }: UpdateControlProps) {
  const { t } = useT();
  if (state?.type === "downloading") return <span>{t("dialogs.settings.updateDownloading", { percent: String(Math.round(state.progress * 100)) })}</span>;
  if (state?.type === "restarting") return <span>{t("dialogs.settings.updateRestarting")}</span>;
  if (state?.type === "available") {
    return (
      <button type="button" className={styles["hb-settings-update-available"]} onClick={onInstall}>
        {t("dialogs.settings.updateAvailable", { version: state.version })}
      </button>
    );
  }
  return (
    <Button variant="secondary" size="sm" disabled={checking} onClick={onCheck}>
      {t("dialogs.settings.checkForUpdates")}
    </Button>
  );
}
