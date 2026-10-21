import { useEffect, useState } from "react";
import { useStoreContext } from "../../data/store/StoreProvider.tsx";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { Select } from "../../primitives/index.ts";
import type { ModelCatalogResult, ReasoningEffort } from "../../data/types.ts";
import type { LaunchChoice } from "./bot-form.ts";
import { ProviderSelect } from "./ProviderSelect.tsx";
import { isSelectableProvider, providerSupportsModel, providerSupportsReasoning } from "./provider-catalog.ts";
import styles from "./NewDialog.module.css";

const REASONING_LEVELS: readonly ReasoningEffort[] = ["low", "medium", "high", "xhigh", "max"];

export interface LaunchChoiceFieldsProps {
  readonly value: LaunchChoice;
  readonly onChange: (next: LaunchChoice) => void;
  readonly disabled?: boolean;
}

/**
 * Provider -> model -> reasoning effort, each an explicit pick with no "default" option: a new bot is
 * only created once all the pickers its provider supports are filled in (`isLaunchChoiceComplete`).
 * Changing the provider clears the model and effort, since neither carries over between CLIs. Shared by
 * the New Bot form and quick create.
 */
export function LaunchChoiceFields({ value, onChange, disabled = false }: LaunchChoiceFieldsProps) {
  const { client } = useStoreContext();
  const { t } = useT();
  const [catalog, setCatalog] = useState<ModelCatalogResult | null>(null);

  const selectable = isSelectableProvider(value.provider);
  const supportsModel = selectable && providerSupportsModel(value.provider);
  const supportsReasoning = selectable && providerSupportsReasoning(value.provider);

  useEffect(() => {
    setCatalog(null);
    if (!supportsModel) return;
    let cancelled = false;
    client
      .call("bot.listModels", { provider: value.provider })
      .then((result) => {
        if (!cancelled) setCatalog(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) setCatalog({ models: [], source: "unavailable", error: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [client, value.provider, supportsModel]);

  const modelsUnavailable = catalog != null && catalog.models.length === 0;

  return (
    <>
      <ProviderSelect
        label={t("dialogs.new.provider")}
        placeholder={t("dialogs.new.provider.placeholder")}
        value={value.provider}
        onChange={(provider) => onChange({ provider, model: null, reasoningEffort: null })}
      />

      {supportsModel && (
        <Select
          label={t("dialogs.new.model")}
          disabled={disabled || catalog == null || modelsUnavailable}
          value={value.model ?? ""}
          placeholder={catalog == null ? t("dialogs.new.model.loading") : t("dialogs.new.model.placeholder")}
          onChange={(model) => onChange({ ...value, model: model.length === 0 ? null : model })}
          options={(catalog?.models ?? []).map((model) => ({ value: model.id, label: model.label }))}
        />
      )}
      {supportsModel && modelsUnavailable && (
        <div className={styles["hb-form-error"]}>{t("dialogs.new.model.unavailable", { error: catalog.error ?? "" })}</div>
      )}

      {supportsReasoning && (
        <Select
          label={t("dialogs.new.reasoning")}
          disabled={disabled}
          value={value.reasoningEffort ?? ""}
          placeholder={t("dialogs.new.reasoning.placeholder")}
          onChange={(level) => onChange({ ...value, reasoningEffort: level.length === 0 ? null : (level as ReasoningEffort) })}
          options={REASONING_LEVELS.map((level) => ({ value: level, label: t(`dialogs.new.reasoning.${level}`) }))}
        />
      )}
    </>
  );
}
