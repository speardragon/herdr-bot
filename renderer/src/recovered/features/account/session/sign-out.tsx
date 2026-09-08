// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L49084; sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa
import { useRef, useState } from "react";
import type { CursorAuthStatus, DesktopBridge } from "../../../contracts/desktop-bridge";
import { OverlayDialog } from "../../../ui/overlay-primitives";
import { SandButton } from "../../../ui/sand-kit-primitives";

export interface SignOutDialogProps {
  bridge: Pick<DesktopBridge, "cursorAccount">;
  cancelLabel: string;
  confirmLabel: string;
  description: string;
  onClose(): void;
  onStatus(status: CursorAuthStatus): void;
  title: string;
}

export function SignOutDialog({
  bridge,
  cancelLabel,
  confirmLabel,
  description,
  onClose,
  onStatus,
  title
}: SignOutDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const confirm = async () => {
    setError(null);
    setBusy(true);
    try {
      onStatus(await bridge.cursorAccount.logout());
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <OverlayDialog
      className="sand-alert-dialog"
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      initialFocusRef={confirmRef}
      label={title}
      onClose={onClose}
      open
      role="alertdialog"
    >
      <h2>{title}</h2>
      <p>{description}</p>
      {error == null ? null : <p role="alert">{error}</p>}
      <footer>
        <SandButton disabled={busy} onClick={onClose} size="sm" variant="secondary">{cancelLabel}</SandButton>
        <SandButton disabled={busy} onClick={() => void confirm()} ref={confirmRef} size="sm">{confirmLabel}</SandButton>
      </footer>
    </OverlayDialog>
  );
}

export default SignOutDialog;
