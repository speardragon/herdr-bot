import { useEffect, useRef, useState } from "react";
import { SandButton } from "../recovered/ui/sand-kit-primitives";

// Exact single-agent delete confirmation recovered from C3n/I3n.
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

function deleteDescription(agent: AgentDeleteTarget): string {
  if (agent.isGroup === true) return "This permanently deletes the group and its chat history. The Bots in it are not deleted and remain available individually. This can't be undone.";
  return "This permanently deletes the agent and its chat history. This can't be undone.";
}

export function AgentDeleteConfirmation({ agent, onClose, onConfirm }: AgentDeleteConfirmationProps) {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const isOpen = agent != null;

  useEffect(() => {
    if (agent == null) return;
    setPending(false);
    setFailure(null);
  }, [agent]);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmRef.current?.focus({ preventScroll: true });
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (pending) return;
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || pending) return;
      const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
      if (buttons.length === 0) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (pending || dialogRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [isOpen, onClose, pending]);

  if (agent == null) return null;
  const confirm = async () => {
    setPending(true);
    setFailure(null);
    try {
      await onConfirm(agent.id);
      onClose();
    } catch {
      setFailure("Deleting failed. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  };

  return <div aria-label={`Delete “${agent.name}”`} aria-modal="true" className="sand-alert-dialog" ref={dialogRef} role="alertdialog" style={{ position: "fixed", inset: "50% auto auto 50%", width: "min(400px, calc(100% - 32px))", padding: 20, color: "var(--cursor-text-primary)", background: "var(--cursor-bg-elevated)", border: "1px solid var(--cursor-border-secondary)", borderRadius: 10, boxShadow: "var(--cursor-box-shadow-xl)", transform: "translate(-50%, -50%)", zIndex: 3200 }}>
    <h3>{`Delete “${agent.name}”`}</h3>
    <p>{deleteDescription(agent)}</p>
    {failure == null ? null : <p role="alert">{failure}</p>}
    <footer style={{ display: "flex", justifyContent: "flex-end", gap: 8, margin: "18px -20px -20px", padding: "12px 16px", borderTop: "1px solid var(--cursor-border-secondary)" }}>
      <SandButton disabled={pending} onClick={onClose} size="sm" variant="secondary">Cancel</SandButton>
      <SandButton disabled={pending} onClick={() => void confirm()} ref={confirmRef} sentiment="danger" size="sm">{pending ? "Deleting..." : "Delete"}</SandButton>
    </footer>
  </div>;
}
