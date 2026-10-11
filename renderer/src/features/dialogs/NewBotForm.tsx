import { useEffect, useState } from "react";
import { useActiveChat } from "../../data/hooks/useActiveChat.ts";
import { useStoreContext } from "../../data/store/StoreProvider.tsx";
import { useDialogHost } from "../../shell/DialogHost.tsx";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { Button, Select, TextArea, TextField } from "../../primitives/index.ts";
import { toAppApiError } from "../../data/types.ts";
import type { ModelEntry, ReasoningEffort } from "../../data/types.ts";
import { AdoptAgentSection } from "./AdoptAgentSection.tsx";
import { emptyBotFormState, isAdopting, validateBotForm } from "./bot-form.ts";
import type { BotFormState, DirectoryCheck } from "./bot-form.ts";
import { DirectoryField } from "./DirectoryField.tsx";
import { ProviderSelect } from "./ProviderSelect.tsx";
import { providerSupportsModel, providerSupportsReasoning } from "./provider-catalog.ts";
import { resolveBotFormDefaults } from "./quick-create-defaults.ts";
import styles from "./NewDialog.module.css";

const REASONING_LEVELS: readonly ReasoningEffort[] = ["low", "medium", "high", "xhigh", "max"];

export function NewBotForm() {
  const { client } = useStoreContext();
  const { setActiveChatId } = useActiveChat();
  const dialogHost = useDialogHost();
  const { t } = useT();

  const [state, setState] = useState<BotFormState | null>(null);
  const [cwdCheck, setCwdCheck] = useState<DirectoryCheck | null>(null);
  const [allowHomeCwd, setAllowHomeCwd] = useState(false);
  const [models, setModels] = useState<readonly ModelEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([client.call("bot.defaults", undefined), client.call("settings.get", undefined)]).then(([defaults, settings]) => {
      if (cancelled) return;
      setState(emptyBotFormState(resolveBotFormDefaults(defaults, settings)));
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  useEffect(() => {
    if (state == null) return;
    let cancelled = false;
    void client.call("bot.listModels", { provider: state.provider }).then((result) => {
      if (!cancelled) setModels(result.models);
    });
    return () => {
      cancelled = true;
    };
  }, [client, state?.provider]);

  if (state == null) return null;

  const adopting = isAdopting(state);
  const validation = validateBotForm(state, cwdCheck, allowHomeCwd);
  const supportsModel = adopting || providerSupportsModel(state.provider);
  const supportsReasoning = !adopting && providerSupportsReasoning(state.provider);

  function patch(next: Partial<BotFormState>) {
    setState((current) => (current == null ? current : { ...current, ...next }));
    setError(null);
  }

  async function submit() {
    if (state == null || !validation.canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { chat } = await client.call("bot.create", {
        name: state.name.trim(),
        description: state.persona.trim().length > 0 ? state.persona.trim() : undefined,
        provider: adopting ? undefined : state.provider,
        cwd: adopting ? undefined : state.cwd,
        permissionMode: adopting || state.permissionMode == null ? undefined : state.permissionMode,
        model: adopting ? undefined : state.model,
        reasoningEffort: adopting ? undefined : state.reasoningEffort,
        adoptPaneId: state.adoptPaneId ?? undefined,
        allowHomeCwd,
      });
      setActiveChatId(chat.id);
      dialogHost.close();
    } catch (err) {
      const apiError = toAppApiError(err);
      if (apiError.code === "home_cwd_requires_confirmation") setAllowHomeCwd(false);
      setError(apiError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles["hb-form"]}>
      <TextField label={t("dialogs.new.name")} placeholder={t("dialogs.new.namePlaceholder")} value={state.name} onChange={(event) => patch({ name: event.target.value })} />
      <TextArea label={t("dialogs.new.persona")} placeholder={t("dialogs.new.personaPlaceholder")} value={state.persona} onChange={(event) => patch({ persona: event.target.value })} />
      <ProviderSelect label={t("dialogs.new.provider")} value={state.provider} onChange={(provider) => patch({ provider })} />

      {!adopting && (
        <DirectoryField
          label={t("dialogs.new.cwd")}
          value={state.cwd}
          onChange={(cwd) => {
            patch({ cwd });
            setAllowHomeCwd(false);
          }}
          onCheckChange={setCwdCheck}
          invalidMessage={validation.cwdError === "not-found" ? t("dialogs.new.cwdInvalid") : null}
        />
      )}

      {validation.needsHomeConfirmation && (
        <div className={styles["hb-home-confirm"]}>
          <div className={styles["hb-home-confirm-text"]}>{t("dialogs.new.homeConfirmBody")}</div>
          <Button type="button" variant="secondary" onClick={() => setAllowHomeCwd(true)}>
            {t("dialogs.new.homeConfirmAction")}
          </Button>
        </div>
      )}

      <Select
        label={t("dialogs.new.permissions")}
        value={state.permissionMode ?? ""}
        disabled={adopting}
        onChange={(value) => patch({ permissionMode: value.length === 0 ? null : (value as "ask" | "auto") })}
        options={[
          { value: "", label: t("dialogs.new.permissions.agentDefault") },
          { value: "ask", label: t("dialogs.new.permissions.ask") },
          { value: "auto", label: t("dialogs.new.permissions.auto") },
        ]}
      />

      {supportsModel && (
        <Select
          label={t("dialogs.new.model")}
          disabled={adopting}
          value={state.model ?? ""}
          onChange={(value) => patch({ model: value.length === 0 ? null : value })}
          options={[{ value: "", label: t("dialogs.new.model.default") }, ...models.map((model) => ({ value: model.id, label: model.label }))]}
        />
      )}

      {supportsReasoning && (
        <Select
          label={t("dialogs.new.reasoning")}
          value={state.reasoningEffort ?? ""}
          onChange={(value) => patch({ reasoningEffort: value.length === 0 ? null : (value as ReasoningEffort) })}
          options={[{ value: "", label: t("dialogs.new.reasoning.default") }, ...REASONING_LEVELS.map((level) => ({ value: level, label: t(`dialogs.new.reasoning.${level}`) }))]}
        />
      )}

      <AdoptAgentSection adoptPaneId={state.adoptPaneId} onChange={(adoptPaneId) => patch({ adoptPaneId })} />

      {error != null && <div className={styles["hb-form-error"]}>{error}</div>}

      <div className={styles["hb-form-footer"]}>
        <Button type="button" variant="secondary" onClick={dialogHost.close}>
          {t("common.cancel")}
        </Button>
        <Button type="button" variant="primary" disabled={!validation.canSubmit || submitting} onClick={submit}>
          {t("dialogs.new.startBot")}
        </Button>
      </div>
    </div>
  );
}
