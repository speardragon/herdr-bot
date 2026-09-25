import { useEffect, useState, type FormEvent } from "react";
import type { TranscriptPrompt } from "../recovered/features/conversation/workspace/model";
import { SandIcon } from "../recovered/ui/sand-kit-primitives";
import { t } from "./locale";
import { optionLetter } from "./pending-prompt";
import "./pending-prompt-card.css";

// herdr-bot: a blocked bot's approval / question form, rendered inline in the transcript like one of
// its bubbles (host entry kind "prompt"). While pending it offers the rows (and a text field when the
// form takes one); once answered it collapses to the chosen row with a check, matching the reference.
// The host parses the pane (core blocked-prompt.ts) and presses the keys (core prompt-service.ts).

export type PendingPromptAnswer =
  | { readonly action: "option"; readonly key: string }
  | { readonly action: "text"; readonly text: string }
  | { readonly action: "next" }
  | { readonly action: "cancel" };

export interface PromptEntryCardProps {
  readonly entry: TranscriptPrompt;
  /** Rooms name the blocked member above the question; a DM already is that bot's chat. */
  readonly showAgentName: boolean;
  readonly onAnswer: (botId: string, signature: string, answer: PendingPromptAnswer) => Promise<void>;
  readonly onOpenInHerdr: (botId: string) => void;
}

function answerErrorText(error: unknown): string {
  const code = typeof error === "object" && error != null && "code" in error ? String((error as { code: unknown }).code) : "";
  if (code === "prompt_changed") return t("The bot's question changed. Pick again from the updated card.", "봇의 질문이 바뀌었어요. 갱신된 카드에서 다시 선택해 주세요.");
  if (code === "not_blocked") return t("The bot is no longer waiting for an answer.", "봇이 더 이상 답변을 기다리지 않아요.");
  if (code === "answer_in_flight") return t("Your previous answer is still being sent.", "이전 답변을 아직 보내는 중이에요.");
  return t("Your answer didn't go through. Try again.", "답변을 보내지 못했어요. 다시 시도해 주세요.");
}

function SettledRow({ entry }: { readonly entry: TranscriptPrompt }) {
  const { answer, prompt } = entry;
  if (entry.status === "answered" && answer?.kind === "option") {
    const index = prompt.options.findIndex((option) => option.key === answer.key);
    return <div className="hb-prompt-card__row hb-prompt-card__row--settled">
      {index >= 0 ? <kbd className="hb-prompt-card__key">{optionLetter(index)}</kbd> : null}
      <span className="hb-prompt-card__label">{answer.label}</span>
      <SandIcon className="hb-prompt-card__check" name="check" size="sm" />
    </div>;
  }
  if (entry.status === "answered" && answer?.kind === "text") {
    return <div className="hb-prompt-card__row hb-prompt-card__row--settled">
      <span className="hb-prompt-card__label">{answer.text}</span>
      <SandIcon className="hb-prompt-card__check" name="check" size="sm" />
    </div>;
  }
  const text = entry.status === "answered" && answer?.kind === "cancelled"
    ? t("Cancelled", "취소함")
    : t("Answered in the terminal", "터미널에서 답변됨");
  return <div className="hb-prompt-card__row hb-prompt-card__row--settled"><span className="hb-prompt-card__label hb-prompt-card__label--muted">{text}</span></div>;
}

export function PromptEntryCard({ entry, showAgentName, onAnswer, onOpenInHerdr }: PromptEntryCardProps) {
  const { botId, botName, prompt } = entry;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  /** A settling answer that went through: the card stays actionable-looking until the host publishes
   * the entry as answered/resolved, but must not be answerable twice in that window. */
  const [sentSignature, setSentSignature] = useState<string | null>(null);

  useEffect(() => {
    setBusy(false);
    setError(null);
  }, [prompt.signature]);

  const pending = entry.status === "pending";
  const disabled = busy || sentSignature === prompt.signature;

  const send = (answer: PendingPromptAnswer, settles: boolean) => {
    if (disabled || !pending) return;
    setBusy(true);
    setError(null);
    void onAnswer(botId, prompt.signature, answer).then(
      () => {
        setBusy(false);
        if (settles) setSentSignature(prompt.signature);
      },
      (failure: unknown) => {
        setBusy(false);
        setError(answerErrorText(failure));
      },
    );
  };

  const submitText = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim().length === 0) return;
    send({ action: "text", text }, true);
  };

  const cancelLabel = t("Cancel this request (Esc)", "이 요청 취소 (Esc)");
  const progress = prompt.progress != null && prompt.progress.total > 1 ? `${Math.min(prompt.progress.done + 1, prompt.progress.total)}/${prompt.progress.total}` : null;
  const question = prompt.kind === "unknown" ? t("This bot is waiting for input in its terminal", "봇이 터미널에서 입력을 기다리고 있어요") : prompt.question;
  const body = prompt.kind === "unknown" ? [prompt.question, ...prompt.body] : prompt.body;

  return (
    <div className="hb-prompt-row" data-entry-id={entry.id} data-status={entry.status}>
      <section aria-busy={busy || undefined} aria-label={t("Bot question", "봇의 질문")} className="hb-prompt-card" data-kind={prompt.kind}>
        <header className="hb-prompt-card__header">
          <div className="hb-prompt-card__heading">
            {showAgentName ? <span className="hb-prompt-card__agent">{botName}</span> : null}
            {prompt.title != null ? <span className="hb-prompt-card__title">{prompt.title}</span> : null}
            <h3 className="hb-prompt-card__question">{question}{progress != null ? <span className="hb-prompt-card__progress"> {progress}</span> : null}</h3>
          </div>
          {pending
            ? <button aria-label={cancelLabel} className="hb-prompt-card__close" disabled={disabled} onClick={() => send({ action: "cancel" }, true)} title={cancelLabel} type="button">
              <SandIcon name="close" size="sm" />
            </button>
            : null}
        </header>
        {pending && body.length > 0
          ? <div className="hb-prompt-card__body" data-mono={prompt.kind === "permission" || undefined}>
            {body.map((line, index) => <span key={`${index}:${line}`}>{line}</span>)}
          </div>
          : null}
        {!pending
          ? <div className="hb-prompt-card__options"><SettledRow entry={entry} /></div>
          : prompt.options.length > 0
            ? <ol className="hb-prompt-card__options">
              {prompt.options.map((option, index) => (
                <li key={option.key}>
                  <button
                    aria-pressed={option.checked ?? undefined}
                    className="hb-prompt-card__row hb-prompt-card__option"
                    disabled={disabled}
                    onClick={() => send({ action: "option", key: option.key }, !prompt.multiSelect)}
                    type="button"
                  >
                    <kbd className="hb-prompt-card__key">{optionLetter(index)}</kbd>
                    {option.checked != null ? <span aria-hidden="true" className="hb-prompt-card__checkbox" data-checked={option.checked}>{option.checked ? "✔" : ""}</span> : null}
                    <span className="hb-prompt-card__label">
                      {option.label}
                      {option.detail != null ? <small>{option.detail}</small> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            : null}
        {pending && prompt.freeTextKey != null
          ? <form className="hb-prompt-card__text" onSubmit={submitText}>
            <input aria-label={t("Type your own answer", "직접 답변 입력")} disabled={disabled} onChange={(event) => setText(event.currentTarget.value)} placeholder={t("Type your own answer", "직접 답변 입력")} type="text" value={text} />
            {text.trim().length > 0 ? <button disabled={disabled} type="submit">{t("Send", "보내기")}</button> : null}
          </form>
          : null}
        {pending && prompt.multiSelect
          ? <div className="hb-prompt-card__actions"><button disabled={disabled} onClick={() => send({ action: "next" }, true)} type="button">{t("Next", "다음")}</button></div>
          : null}
        {pending && prompt.kind === "unknown"
          ? <div className="hb-prompt-card__actions"><button data-variant="secondary" onClick={() => onOpenInHerdr(botId)} type="button">{t("Open in herdr", "herdr에서 열기")}</button></div>
          : null}
        {error != null ? <p className="hb-prompt-card__error" role="alert">{error}</p> : null}
      </section>
    </div>
  );
}
