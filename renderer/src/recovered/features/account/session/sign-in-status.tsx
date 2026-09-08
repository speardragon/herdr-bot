// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L523 bytes 5391939,5429729,5432418,5432721,5432885; sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa
import { useState } from "react";
import type { CursorAuthStatus, DesktopBridge } from "../../../contracts/desktop-bridge";
import { SandButton } from "../../../ui/sand-kit-primitives";

type SignInAccountStatus = Extract<CursorAuthStatus, { kind: "logged-out" | "logging-in" }>;

export interface SignInStatusProps {
  account: SignInAccountStatus;
  bridge: Pick<DesktopBridge, "cursorAccount">;
  cancelLabel: string;
  continueLabel: string;
  onStatus(status: CursorAuthStatus): void;
  reopenLabel: string;
  signInLabel: string;
}

export function SignInStatus({
  account,
  bridge,
  cancelLabel,
  continueLabel,
  onStatus,
  reopenLabel,
  signInLabel
}: SignInStatusProps) {
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<CursorAuthStatus>) => {
    setError(null);
    try {
      onStatus(await action());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  if (account.kind === "logging-in") {
    return (
      <div className="sand-onboarding__landing-wait">
        <p aria-live="polite">{continueLabel}</p>
        <span>
          <SandButton onClick={() => void run(() => bridge.cursorAccount.login())} size="sm" variant="secondary">{reopenLabel}</SandButton>
          <span aria-hidden="true">·</span>
          <SandButton onClick={() => void run(() => bridge.cursorAccount.cancelLogin())} size="sm" variant="secondary">{cancelLabel}</SandButton>
        </span>
        {error == null ? null : <p aria-live="polite">{error}</p>}
      </div>
    );
  }

  return (
    <>
      <SandButton onClick={() => void run(() => bridge.cursorAccount.login())} size="sm">{signInLabel}</SandButton>
      {error == null ? null : <p aria-live="polite">{error}</p>}
    </>
  );
}

export default SignInStatus;
