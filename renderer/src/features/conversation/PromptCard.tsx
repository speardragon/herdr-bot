import { useState } from "react";
import { Check, X } from "lucide-react";
import { useStoreContext } from "../../data/store/StoreProvider.tsx";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { Badge, Button, IconButton, TextField } from "../../primitives/index.ts";
import { isAppApiError } from "../../data/types.ts";
import type { ChatSummary, PendingPrompt, PendingPromptOption, TranscriptEntry } from "../../data/types.ts";
import { derivePromptCardView, optionBadgeLabel, seedCheckedOptions } from "./prompt-card-state.ts";
import styles from "./PromptCard.module.css";

export interface PromptCardProps {
  readonly entry: TranscriptEntry;
  /** The *bot's own* `ChatSummary` (the one with `.bot.pendingPrompt`) -- in a room, this is the
   * blocked member resolved from `entry.author.id`, not the room's own summary (a room has no
   * `pendingPrompt` of its own). `null` if that bot can no longer be found (e.g. deleted). */
  readonly botChat: ChatSummary | null;
}

/**
 * The inline approval/question card. `entry.prompt`/`.status` is historical; whether it's
 * safe to answer inline (vs. the "Answered in the terminal" inert fallback) depends on comparing its
 * `signature` against the bot's *live* `botChat.bot.pendingPrompt` -- see prompt-card-state.ts.
 */
export function PromptCard({ entry, botChat }: PromptCardProps) {
  const { client } = useStoreContext();
  const { t } = useT();
  const view = derivePromptCardView(entry, botChat?.bot?.pendingPrompt ?? null);
  const [checked, setChecked] = useState<Record<string, boolean>>(() => (view.prompt != null ? seedCheckedOptions(view.prompt) : {}));
  const [freeTextKey, setFreeTextKey] = useState<string | null>(null);
  const [freeTextValue, setFreeTextValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (view.mode === "hidden" || view.prompt == null) return null;
  const prompt = view.prompt;
  const botId = botChat?.id;

  async function answer(action: "option" | "text" | "next" | "cancel", extra: { readonly key?: string; readonly text?: string } = {}) {
    if (botId == null || submitting) return;
    setSubmitting(true);
    try {
      await client.call("prompt.answer", { botId, signature: prompt.signature, action, ...extra });
      setFreeTextKey(null);
      setFreeTextValue("");
    } catch (error) {
      // `prompt_changed`/`not_blocked`/`answer_in_flight` all resolve themselves once the chat's live
      // `pendingPrompt` updates and this view re-derives on the next render -- nothing else to do here.
      if (!isAppApiError(error)) throw error;
    } finally {
      setSubmitting(false);
    }
  }

  function toggleCheckbox(option: PendingPromptOption) {
    const next = !checked[option.key];
    setChecked((prev) => ({ ...prev, [option.key]: next }));
    void answer("option", { key: option.key });
  }

  function selectOption(option: PendingPromptOption) {
    if (option.key === prompt.freeTextKey) {
      setFreeTextKey(option.key);
      return;
    }
    if (prompt.multiSelect) {
      toggleCheckbox(option);
    } else {
      void answer("option", { key: option.key });
    }
  }

  const interactive = view.mode === "live" && !submitting;

  return (
    <div className={styles["hb-prompt-card"]}>
      {interactive && (
        <div className={styles["hb-prompt-dismiss"]}>
          <IconButton size="sm" aria-label={t("conversation.promptDismiss")} onClick={() => void answer("cancel")}>
            <X size={14} />
          </IconButton>
        </div>
      )}
      {prompt.title != null && <div className={styles["hb-prompt-title"]}>{prompt.title}</div>}
      <div className={styles["hb-prompt-question"]}>
        {prompt.question}
        {prompt.progress != null && <span className={styles["hb-prompt-progress"]}>{t("conversation.questionProgress", { done: prompt.progress.done, total: prompt.progress.total })}</span>}
      </div>
      <PromptBody body={prompt.body} />

      {view.mode === "inert" && <div className={styles["hb-prompt-inert"]}>{t("conversation.answeredInTerminal")}</div>}

      {view.mode !== "inert" && (
        <div className={styles["hb-prompt-options"]}>
          {prompt.options.map((option, index) => (
            <PromptOptionRow
              key={option.key}
              option={option}
              badgeLabel={optionBadgeLabel(index)}
              prompt={prompt}
              interactive={interactive}
              checked={checked[option.key] ?? option.checked ?? false}
              selected={view.mode === "answered" ? (view.answer?.kind === "option" ? view.answer.key === option.key : option.selected) : false}
              isFreeTextOpen={freeTextKey === option.key}
              freeTextValue={freeTextValue}
              onFreeTextChange={setFreeTextValue}
              onFreeTextSubmit={() => void answer("text", { text: freeTextValue })}
              onSelect={() => selectOption(option)}
            />
          ))}
        </div>
      )}

      {interactive && prompt.multiSelect && (
        <div className={styles["hb-prompt-footer"]}>
          <Button variant="secondary" size="sm" onClick={() => void answer("cancel")} disabled={submitting}>
            {t("conversation.promptCancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={() => void answer("next")} disabled={submitting}>
            {t("conversation.promptNext")}
          </Button>
        </div>
      )}
    </div>
  );
}

function PromptBody({ body }: { readonly body: readonly string[] }) {
  if (body.length === 0) return null;
  const [command, ...rest] = body;
  return (
    <div className={styles["hb-prompt-body"]}>
      {command != null && <div className={styles["hb-prompt-command"]}>{command}</div>}
      {rest.map((line, index) => (
        <div key={index} className={styles["hb-prompt-description"]}>
          {line}
        </div>
      ))}
    </div>
  );
}

interface PromptOptionRowProps {
  readonly option: PendingPromptOption;
  readonly badgeLabel: string;
  readonly prompt: PendingPrompt;
  readonly interactive: boolean;
  readonly checked: boolean;
  readonly selected: boolean;
  readonly isFreeTextOpen: boolean;
  readonly freeTextValue: string;
  readonly onFreeTextChange: (value: string) => void;
  readonly onFreeTextSubmit: () => void;
  readonly onSelect: () => void;
}

function PromptOptionRow({ option, badgeLabel, prompt, interactive, checked, selected, isFreeTextOpen, freeTextValue, onFreeTextChange, onFreeTextSubmit, onSelect }: PromptOptionRowProps) {
  const { t } = useT();

  if (isFreeTextOpen) {
    return (
      <div className={styles["hb-prompt-option"]}>
        <Badge tone="key">{badgeLabel}</Badge>
        <div className={styles["hb-prompt-freetext"]}>
          <TextField
            value={freeTextValue}
            placeholder={t("conversation.promptTextPlaceholder")}
            onChange={(event) => onFreeTextChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onFreeTextSubmit();
            }}
            autoFocus
          />
          <Button size="sm" variant="primary" onClick={onFreeTextSubmit}>
            {t("conversation.promptSubmit")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <button type="button" className={`${styles["hb-prompt-option"]} ${selected ? styles["hb-prompt-option--selected"] : ""}`} onClick={onSelect} disabled={!interactive}>
      <Badge tone="key">{badgeLabel}</Badge>
      {prompt.multiSelect && (
        <span className={`${styles["hb-prompt-checkbox"]} ${checked ? styles["hb-prompt-checkbox--checked"] : ""}`} aria-hidden>
          {checked && <Check size={12} />}
        </span>
      )}
      <span className={styles["hb-prompt-option-label"]}>{option.label}</span>
      {option.detail != null && <span className={styles["hb-prompt-option-detail"]}>{option.detail}</span>}
    </button>
  );
}
