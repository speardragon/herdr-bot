import { useState } from "react";
import type { DesktopBridge } from "../../../contracts/desktop-bridge";
import { OverlayDialog } from "../../../ui/overlay-primitives";
import { SandButton } from "../../../ui/sand-kit-primitives";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L537
// Immutable root sha256: ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa

export type FeedbackCode = "access-denied" | "invalid-feedback" | "not-signed-in" | "rate-limited" | "subscription-required" | "unavailable";

export interface FeedbackLabels {
  title: string;
  introduction: string;
  placeholder: string;
  includeConversationId: string;
  cancel: string;
  send: string;
  sending: string;
  sent: string;
  done: string;
}

export interface FeedbackDialogProps {
  bridge: Pick<DesktopBridge, "submitFeedback">;
  conversationId: string | null;
  defaultIncludeConversationId?: boolean;
  errorMessages: Record<FeedbackCode, string>;
  labels: FeedbackLabels;
  onClose(): void;
}

type FeedbackState = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "failed"; code: FeedbackCode };

function feedbackCode(value: unknown): FeedbackCode | null {
  if (typeof value !== "object" || value == null || !("ok" in value)) return null;
  if ((value as { ok: unknown }).ok === true) return null;
  const code = (value as { code?: unknown }).code;
  return typeof code === "string" && ["access-denied", "invalid-feedback", "not-signed-in", "rate-limited", "subscription-required", "unavailable"].includes(code)
    ? code as FeedbackCode
    : "unavailable";
}

export function FeedbackDialog({ bridge, conversationId, defaultIncludeConversationId = false, errorMessages, labels, onClose }: FeedbackDialogProps) {
  const [message, setMessage] = useState("");
  const [includeConversationIdOverride, setIncludeConversationIdOverride] = useState<boolean | null>(null);
  const [state, setState] = useState<FeedbackState>({ kind: "idle" });
  const includeConversationId = includeConversationIdOverride ?? defaultIncludeConversationId;
  const sending = state.kind === "sending";
  const canSend = message.trim().length > 0 && message.length <= 10_000 && !sending && state.kind !== "sent";
  const statusMessage = state.kind === "sent" ? labels.sent : state.kind === "failed" ? errorMessages[state.code] : null;

  const submit = async () => {
    if (!canSend) return;
    setState({ kind: "sending" });
    try {
      const result = await bridge.submitFeedback({
        message,
        ...(includeConversationId && conversationId != null ? { conversationId } : {})
      });
      const code = feedbackCode(result);
      setState(code == null && typeof result === "object" && result != null && "ok" in result && (result as { ok: unknown }).ok === true
        ? { kind: "sent" }
        : { kind: "failed", code: code ?? "unavailable" });
    } catch {
      setState({ kind: "failed", code: "unavailable" });
    }
  };
  return (
    <OverlayDialog
      className="sand-feedback-dialog"
      closeOnBackdrop={!sending}
      closeOnEscape={!sending}
      label={labels.title}
      onClose={onClose}
      open
    >
      <header><h2>{labels.title}</h2></header>
      <div>
        <p>{labels.introduction}</p>
        <textarea autoFocus maxLength={10_000} onChange={(event) => setMessage(event.currentTarget.value)} placeholder={labels.placeholder} value={message} />
        {conversationId == null ? null : <label><input checked={includeConversationId} onChange={(event) => setIncludeConversationIdOverride(event.currentTarget.checked)} type="checkbox" />{labels.includeConversationId}</label>}
        {statusMessage == null ? null : <p aria-live="polite" role="status">{statusMessage}</p>}
      </div>
      <footer>
        <SandButton disabled={sending} onClick={onClose} size="sm" variant="secondary">{state.kind === "sent" ? labels.done : labels.cancel}</SandButton>
        <SandButton disabled={!canSend} onClick={() => void submit()} size="sm">{sending ? labels.sending : labels.send}</SandButton>
      </footer>
    </OverlayDialog>
  );
}
