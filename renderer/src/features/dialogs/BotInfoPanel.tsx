import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronsRight, ExternalLink } from "lucide-react";
import { useChat } from "../../data/hooks/useChat.ts";
import { useStoreContext } from "../../data/store/StoreProvider.tsx";
import { resolvePersonaColor } from "../../data/avatar-colors.ts";
import type { PersonaColor } from "../../data/avatar-colors.ts";
import { useInfoPanel } from "../../shell/PanelHost.tsx";
import { useDialogHost } from "../../shell/DialogHost.tsx";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { toAppApiError } from "../../data/types.ts";
import type { ModelEntry, ReasoningEffort } from "../../data/types.ts";
import { Avatar, Button, IconButton, TextArea, TextField, Select } from "../../primitives/index.ts";
import { BotOnboardingBanner } from "./BotOnboardingBanner.tsx";
import { ColorSwatches } from "./ColorSwatches.tsx";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog.tsx";
import { DirectoryField } from "./DirectoryField.tsx";
import type { DirectoryCheck } from "./bot-form.ts";
import { diffLaunchSettings, launchSettingsFormFromFacts } from "./launch-settings-diff.ts";
import type { LaunchSettingsFormState } from "./launch-settings-diff.ts";
import { providerSupportsReasoning } from "./provider-catalog.ts";
import { RelaunchConfirmDialog } from "./RelaunchConfirmDialog.tsx";
import { ToggleSwitch } from "./ToggleSwitch.tsx";
import styles from "./InfoPanel.module.css";

const REASONING_LEVELS: readonly ReasoningEffort[] = ["low", "medium", "high", "xhigh", "max"];

export interface BotInfoPanelProps {
  readonly botId: string;
}

/** The bot info/settings panel: avatar + color editor, name/label/description, the
 * Notifications toggle, launch settings with a relaunch-to-apply confirmation, "Open in herdr", a retry
 * affordance for failed onboarding, and delete. Opened via `useDialogs().openBotInfo(id)` (never mount
 * this directly with `useInfoPanel()` from outside the main column -- see `dialogs-store.ts`). */
export function BotInfoPanel({ botId }: BotInfoPanelProps) {
  const chat = useChat(botId);
  const { client } = useStoreContext();
  const panel = useInfoPanel();
  const dialogHost = useDialogHost();
  const { t } = useT();

  const [name, setName] = useState(chat?.name ?? "");
  const [label, setLabel] = useState(chat?.title ?? "");
  const [description, setDescription] = useState(chat?.description ?? "");
  const [colorOpen, setColorOpen] = useState(false);
  const avatarButtonRef = useRef<HTMLButtonElement>(null);

  const [launch, setLaunch] = useState<LaunchSettingsFormState | null>(null);
  const [cwdCheck, setCwdCheck] = useState<DirectoryCheck | null>(null);
  const [allowHomeCwd, setAllowHomeCwd] = useState(false);
  const [models, setModels] = useState<readonly ModelEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Re-sync local form state only when the *chat id* changes (opening a different bot's panel) --
  // not on every `chat.changed` push, which would otherwise clobber in-progress edits whenever the
  // bot's own status/presence updates in the background.
  useEffect(() => {
    if (chat == null) return;
    setName(chat.name);
    setLabel(chat.title);
    setDescription(chat.description);
    if (chat.bot != null) setLaunch(launchSettingsFormFromFacts(chat.bot));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat?.id]);

  // Close the panel on its own if the bot it's showing disappears (deleted from anywhere -- the
  // sidebar's context menu, this panel's own Delete button, a palette action, ...).
  useEffect(() => {
    if (chat == null) panel.close();
  }, [chat, panel]);

  useEffect(() => {
    if (chat?.bot?.provider == null) return;
    let cancelled = false;
    void client.call("bot.listModels", { provider: chat.bot.provider }).then((result) => {
      if (!cancelled) setModels(result.models);
    });
    return () => {
      cancelled = true;
    };
  }, [client, chat?.bot?.provider]);

  if (chat == null || chat.bot == null || launch == null) return null;
  const bot = chat.bot;
  const adopted = bot.adopted;

  async function saveProfile(patch: { name?: string; title?: string; description?: string; avatarColor?: string }) {
    try {
      await client.call("chat.updateProfile", { chatId: botId, ...patch });
    } catch (err) {
      setError(toAppApiError(err).message);
    }
  }

  const diff = diffLaunchSettings(bot, launch);
  const needsHomeConfirmation = diff?.cwd != null && (cwdCheck?.isHome ?? false) && !allowHomeCwd;

  async function applyLaunchSettings() {
    if (diff == null) return;
    await client.call("bot.updateLaunchSettings", { botId, ...diff, allowHomeCwd });
  }

  function openRelaunchConfirm() {
    dialogHost.open(<RelaunchConfirmDialog name={chat!.name} onConfirm={applyLaunchSettings} />, {});
  }

  return (
    <div>
      <div className={styles["hb-panel-header"]}>
        <IconButton aria-label={t("common.back")} size="sm" onClick={panel.close}>
          <ChevronLeft size={18} />
        </IconButton>
        <span className={styles["hb-panel-title"]}>{t("dialogs.botInfo.title")}</span>
        <IconButton aria-label={t("dialogs.botInfo.closeDetails")} size="sm" onClick={panel.close}>
          <ChevronsRight size={18} />
        </IconButton>
      </div>

      <BotOnboardingBanner chatId={botId} />

      <div className={styles["hb-panel-body"]}>
        <div className={styles["hb-panel-avatar"]}>
          <button
            ref={avatarButtonRef}
            type="button"
            className={styles["hb-panel-avatar-button"]}
            aria-label={t("dialogs.botInfo.changeColor")}
            onClick={() => setColorOpen(true)}
          >
            <Avatar kind="bot" color={resolvePersonaColor(chat.avatarColor)} name={chat.name} size="xl" />
          </button>
        </div>

        {/* Inline (not a floating Popover) so opening it pushes the fields below down the panel,
         * rather than overlaying them. */}
        {colorOpen && (
          <div className={styles["hb-panel-color-popover"]} aria-label={t("dialogs.botInfo.changeColor")}>
            <p className={styles["hb-panel-color-popover-title"]}>{t("dialogs.botInfo.changeColor")}</p>
            <ColorSwatches
              value={resolvePersonaColor(chat.avatarColor)}
              onChange={(color: PersonaColor) => {
                void saveProfile({ avatarColor: color });
                setColorOpen(false);
              }}
              aria-label={t("dialogs.botInfo.changeColor")}
            />
          </div>
        )}

        <Button variant="ghost" onClick={() => client.call("bot.focus", { botId })}>
          <ExternalLink size={14} /> {t("dialogs.botInfo.openInHerdr")}
        </Button>

        <TextField label={t("dialogs.new.name")} value={name} onChange={(event) => setName(event.target.value)} onBlur={() => name !== chat.name && saveProfile({ name })} />
        <TextField label={t("dialogs.botInfo.label")} value={label} onChange={(event) => setLabel(event.target.value)} onBlur={() => label !== chat.title && saveProfile({ title: label })} />
        <TextArea label={t("dialogs.botInfo.description")} value={description} onChange={(event) => setDescription(event.target.value)} onBlur={() => description !== chat.description && saveProfile({ description })} />

        <div className={styles["hb-panel-card"]}>
          <div className={styles["hb-panel-card-text"]}>
            <div className={styles["hb-panel-card-title"]}>{t("dialogs.botInfo.notifications")}</div>
            <div className={styles["hb-panel-card-help"]}>{t("dialogs.botInfo.notificationsHelp")}</div>
          </div>
          <ToggleSwitch
            checked={chat.notifyOnUpdatesEnabled}
            aria-label={t("dialogs.botInfo.notifications")}
            onChange={(next) => void client.call("chat.setNotifyOnUpdates", { chatId: botId, isEnabled: next })}
          />
        </div>

        <div className={styles["hb-panel-section-header"]}>{t("dialogs.botInfo.launchSettings")}</div>
        {adopted ? (
          <p className={styles["hb-panel-help"]}>{t("dialogs.botInfo.adoptedNote")}</p>
        ) : (
          <>
            <DirectoryField label={t("dialogs.new.cwd")} value={launch.cwd} onChange={(cwd) => { setLaunch({ ...launch, cwd }); setAllowHomeCwd(false); }} onCheckChange={setCwdCheck} invalidMessage={null} />
            <Select
              label={t("dialogs.new.permissions")}
              value={launch.permissionMode ?? ""}
              onChange={(value) => setLaunch({ ...launch, permissionMode: value.length === 0 ? null : (value as "ask" | "auto") })}
              options={[
                { value: "", label: t("dialogs.new.permissions.agentDefault") },
                { value: "ask", label: t("dialogs.new.permissions.ask") },
                { value: "auto", label: t("dialogs.new.permissions.auto") },
              ]}
            />
            <Select
              label={t("dialogs.new.model")}
              helperText={t("dialogs.botInfo.modelHelp")}
              value={launch.model ?? ""}
              onChange={(value) => setLaunch({ ...launch, model: value.length === 0 ? null : value })}
              options={[{ value: "", label: t("dialogs.new.model.default") }, ...models.map((model) => ({ value: model.id, label: model.label }))]}
            />
            {providerSupportsReasoning(bot.provider) && (
              <Select
                label={t("dialogs.new.reasoning")}
                value={launch.reasoningEffort ?? ""}
                onChange={(value) => setLaunch({ ...launch, reasoningEffort: value.length === 0 ? null : (value as ReasoningEffort) })}
                options={[{ value: "", label: t("dialogs.new.reasoning.default") }, ...REASONING_LEVELS.map((level) => ({ value: level, label: t(`dialogs.new.reasoning.${level}`) }))]}
              />
            )}

            {needsHomeConfirmation && (
              <div className={styles["hb-panel-card"]}>
                <div className={styles["hb-panel-card-text"]}>{t("dialogs.new.homeConfirmBody")}</div>
                <Button type="button" variant="secondary" onClick={() => setAllowHomeCwd(true)}>
                  {t("dialogs.new.homeConfirmAction")}
                </Button>
              </div>
            )}

            {error != null && <div className={styles["hb-panel-error"]}>{error}</div>}

            <div className={styles["hb-panel-full-button"]}>
              <Button variant="secondary" disabled={diff == null || needsHomeConfirmation} onClick={openRelaunchConfirm}>
                {t("dialogs.botInfo.restartToApply")}
              </Button>
            </div>
          </>
        )}

        <div className={styles["hb-panel-footer"]}>
          <div className={styles["hb-panel-full-button"]}>
            <Button variant="danger" onClick={() => dialogHost.open(<DeleteConfirmDialog chatId={botId} name={chat.name} />, {})}>
              {t("common.delete")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
