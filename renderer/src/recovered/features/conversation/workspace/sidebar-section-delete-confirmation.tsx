import { useEffect, useRef, useState } from "react";
import type { SidebarSectionDeleteConfirmation } from "./sidebar-sections-state";
import { SandButton } from "../../../ui/sand-kit-primitives";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js bytes 2783470-2783850
// A3n: exact section-delete alert title, description, labels, and destructive model.

export interface SidebarSectionDeleteTarget {
  readonly id: string;
  readonly name: string;
  readonly confirmation: SidebarSectionDeleteConfirmation;
}

export interface SidebarSectionDeleteConfirmationProps {
  readonly section: SidebarSectionDeleteTarget | null;
  onClose(): void;
  onConfirm(sectionId: string): Promise<void>;
}

function restoreSectionHeaderFocus(sectionId: string): void {
  const headers = [...document.querySelectorAll<HTMLElement>(".sand-agents-section__header")];
  const matchingHeader = headers.find((header) => header.dataset.sectionId === sectionId);
  (matchingHeader ?? headers[0])?.focus();
}

export function SidebarSectionDeleteConfirmation({ section, onClose, onConfirm }: SidebarSectionDeleteConfirmationProps) {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (section == null) return;
    setPending(false);
    setFailure(null);
    confirmRef.current?.focus();
  }, [section]);

  if (section == null) return null;
  const close = () => {
    onClose();
    queueMicrotask(() => restoreSectionHeaderFocus(section.id));
  };
  const confirm = async () => {
    setPending(true);
    setFailure(null);
    try {
      await onConfirm(section.id);
      close();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  };

  return <section aria-label={section.confirmation.title} aria-modal="true" role="alertdialog" style={{ position: "fixed", inset: "50% auto auto 50%", width: "min(400px, calc(100% - 32px))", padding: 20, color: "var(--cursor-text-primary)", background: "var(--cursor-bg-elevated)", border: "1px solid var(--cursor-border-secondary)", borderRadius: 10, boxShadow: "var(--cursor-box-shadow-xl)", transform: "translate(-50%, -50%)", zIndex: 3200 }}>
    <h2>{section.confirmation.title}</h2>
    <p>{section.confirmation.description}</p>
    {failure == null ? null : <p role="alert">{failure}</p>}
    <footer style={{ display: "flex", justifyContent: "flex-end", gap: 8, margin: "18px -20px -20px", padding: "12px 16px", borderTop: "1px solid var(--cursor-border-secondary)" }}>
      <SandButton disabled={pending} onClick={close} size="sm" variant="secondary">{section.confirmation.cancelLabel}</SandButton>
      <SandButton disabled={pending} onClick={() => void confirm()} ref={confirmRef} sentiment="danger" size="sm">{section.confirmation.confirmLabel}</SandButton>
    </footer>
  </section>;
}
