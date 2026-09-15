import { t } from "./locale";
import { useId, useRef, useState } from "react";
import { OverlayDialog } from "../recovered/ui/overlay-primitives";
import { SandButton } from "../recovered/ui/sand-kit-primitives";

// herdr-bot: this used to be a hand-rolled modal (its own focus-trap/Escape/pointerdown effects,
// no backdrop, not portaled) that predates OverlayDialog -- the primitive AppAlertHost.tsx uses for
// every other confirm dialog in the app (including the group-member "제거" confirmation this sits
// next to). That gave the sidebar's "삭제" confirmation a visibly different look (no dimmed
// backdrop) and, separately, an untranslated English title ("Delete "X"") in an otherwise-Korean
// UI. Sharing OverlayDialog fixes both at once and deletes ~50 lines of duplicated modal plumbing.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L59561

export interface AgentDeleteTarget {
  id: string;
  name: string;
  isGroup?: boolean;
}

export interface AgentDeleteConfirmationProps {
  agent: AgentDeleteTarget | null;
  onClose(): void;
  onConfirm(agentId: string): Promise<void>;
}

function deleteTitle(agent: AgentDeleteTarget): string {
  return t(`Delete "${agent.name}"?`, `"${agent.name}"을(를) 삭제할까요?`);
}

function deleteDescription(agent: AgentDeleteTarget): string {
  if (agent.isGroup === true) return t("This permanently deletes the group and its chat history. The Bots in it are not deleted and remain available individually. This can't be undone.");
  return t("This permanently deletes the agent and its chat history. This can't be undone.");
}

export function AgentDeleteConfirmation({ agent, onClose, onConfirm }: AgentDeleteConfirmationProps) {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  if (agent == null) return null;
  const confirm = async () => {
    setPending(true);
    setFailure(null);
    try {
      await onConfirm(agent.id);
      onClose();
    } catch {
      setFailure(t("Deleting failed. Check your connection and try again."));
    } finally {
      setPending(false);
    }
  };

  return <OverlayDialog
    closeOnBackdrop={!pending}
    closeOnEscape={!pending}
    describedBy={descriptionId}
    initialFocusRef={confirmRef}
    labelledBy={titleId}
    onClose={onClose}
    open
    className="sand-dialog sand-alert-dialog"
    panelStyle={{ width: "min(400px, calc(100% - 32px))", padding: 20, color: "var(--cursor-text-primary)", background: "var(--cursor-bg-elevated)", border: "1px solid var(--cursor-border-secondary)", borderRadius: 10, boxShadow: "var(--cursor-box-shadow-xl)" }}
    role="alertdialog"
  >
    <header><h2 id={titleId}>{deleteTitle(agent)}</h2><p id={descriptionId}>{deleteDescription(agent)}</p></header>
    {failure == null ? null : <div><p role="alert">{failure}</p></div>}
    <footer style={{ display: "flex", justifyContent: "flex-end", gap: 8, margin: "18px -20px -20px", padding: "12px 16px", borderTop: "1px solid var(--cursor-border-secondary)" }}>
      <SandButton disabled={pending} onClick={onClose} size="sm" variant="secondary">{t("Cancel")}</SandButton>
      <SandButton disabled={pending} onClick={() => void confirm()} ref={confirmRef} sentiment="danger" size="sm">{pending ? t("Deleting...") : t("Delete")}</SandButton>
    </footer>
  </OverlayDialog>;
}
