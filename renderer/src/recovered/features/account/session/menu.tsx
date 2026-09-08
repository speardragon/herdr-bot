// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L499 bytes 2328200,2331500,2332789,2337409,2346511,2346725,2346952,2347189,2347629,2347841,2347970; sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { CursorAuthStatus, CursorUsageSummary, DesktopBridge } from "../../../contracts/desktop-bridge";
import { SandMenuContent, SandMenuItem, SandMenuRoot, SandMenuTrigger } from "../../../ui/sand-floating-primitives";

export interface AccountMenuProps {
  account: CursorAuthStatus | null;
  accountLabel: string;
  bridge: Pick<DesktopBridge, "cursorAccount">;
  displayName: string;
  experimentsSnapshot: unknown;
  isOpen: boolean;
  updatePill?: ReactNode;
  onError(message: string): void;
  onOpenAbout(): void;
  onOpenFeedback(): void;
  onOpenHelp(): void;
  onOpenIos(): void;
  onOpenSettings(): void;
  onOpenUsage(): void;
  onOpenChange(open: boolean): void;
  onRequestLogout(): void;
  onStatus(status: CursorAuthStatus): void;
  labels: {
    about: string;
    helpCenter: string;
    logOut: string;
    sendFeedback: string;
    settings: string;
    signIn: string;
    weeklyUsage: string;
    included: string;
    onDemand: string;
    spendThisCycle: string;
    changeLimit: string;
    ios: string;
  };
}

function isIosLinkEnabled(snapshot: unknown): boolean {
  if (typeof snapshot !== "object" || snapshot == null || Array.isArray(snapshot)) return false;
  const gates = (snapshot as { featureGates?: unknown }).featureGates;
  return typeof gates === "object" && gates != null && !Array.isArray(gates)
    && (gates as { sand_get_grok_bot_ios?: unknown }).sand_get_grok_bot_ios === true;
}

function percentLabel(value: number | null): string {
  return value == null ? "—" : `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

const MINUTES_PER_DAY = 1440;

function countdownLabel(nextResetMs: number | null, nowMs: number, prefix: "Resets" | "Ends"): string | null {
  if (nextResetMs == null || !Number.isFinite(nextResetMs)) return null;
  const days = Math.ceil((nextResetMs - nowMs) / (MINUTES_PER_DAY * 60 * 1000));
  if (days <= 0) return `${prefix} today`;
  return `${prefix} in ${days} ${days === 1 ? "day" : "days"}`;
}

export function usageResetLabel(summary: Pick<CursorUsageSummary, "sandUsageResetTimestampMs" | "isSandTrial" | "hasNonZeroIncludedLimit">, nowMs: number): string | null {
  const prefix = summary.isSandTrial ? "Ends" : "Resets";
  return countdownLabel(summary.sandUsageResetTimestampMs, nowMs, prefix)
    ?? (!summary.isSandTrial && summary.hasNonZeroIncludedLimit ? "Resets in 7 days" : null);
}

export function accountUsageIdentity(account: CursorAuthStatus | null): string | null {
  return account?.kind === "logged-in" ? `logged-in:${account.authId ?? account.email ?? "account"}` : null;
}

function currencyLabel(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function onDemandLabel(summary: CursorUsageSummary): string {
  const onDemand = summary.onDemand;
  if (onDemand == null) return "—";
  const used = currencyLabel(onDemand.usedCents);
  return onDemand.limitCents == null ? used : `${used} / ${currencyLabel(onDemand.limitCents)}`;
}

export function normalizeAccountName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** The account-scoped bridge commit used by both native blur and detached-ref cleanup. */
export async function commitAccountName(
  bridge: Pick<DesktopBridge, "cursorAccount">,
  value: string
): Promise<CursorAuthStatus | null> {
  const next = normalizeAccountName(value);
  return next.length === 0 ? null : bridge.cursorAccount.updateName(next);
}

interface AccountNameEditorProps {
  bridge: Pick<DesktopBridge, "cursorAccount">;
  onError(message: string): void;
  onStatus(status: CursorAuthStatus): void;
}

function AccountNameEditor({ bridge, onError, onStatus }: AccountNameEditorProps) {
  const [mode, setMode] = useState<"viewing" | "editing" | "saving">("viewing");
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelOnBlurRef = useRef(false);
  const blurHandledRef = useRef(false);
  const viaKeyboardRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const cancel = useCallback(() => {
    setDraft("");
    setMode("viewing");
  }, []);

  const save = useCallback(async (value: string) => {
    if (normalizeAccountName(value).length === 0) {
      cancel();
      return;
    }
    setMode("saving");
    try {
      const status = await commitAccountName(bridge, value);
      if (!mountedRef.current) return;
      if (status == null) {
        cancel();
        return;
      }
      onStatus(status);
      setDraft("");
      setMode("viewing");
    } catch (reason) {
      if (!mountedRef.current) return;
      setMode("editing");
      onError(`Couldn’t save your name: ${reason instanceof Error ? reason.message : String(reason)}`);
      queueMicrotask(() => inputRef.current?.focus());
    }
  }, [bridge, cancel, onError, onStatus]);

  const saveRef = useRef(save);
  saveRef.current = save;
  const blurHandlerRef = useRef<(value: string) => void>(() => undefined);
  blurHandlerRef.current = (value) => {
    if (mode === "saving" || blurHandledRef.current) return;
    blurHandledRef.current = true;
    const viaKeyboard = viaKeyboardRef.current;
    viaKeyboardRef.current = false;
    if (cancelOnBlurRef.current) {
      cancelOnBlurRef.current = false;
      void viaKeyboard;
      cancel();
      return;
    }
    void saveRef.current(value);
  };

  const inputRefCallback = useCallback((node: HTMLInputElement | null): (() => void) | void => {
    if (node == null) return;
    inputRef.current = node;
    blurHandledRef.current = false;
    cancelOnBlurRef.current = false;
    viaKeyboardRef.current = false;
    node.focus();
    node.select();
    const nativeBlurHandler = () => blurHandlerRef.current(node.value);
    node.addEventListener("blur", nativeBlurHandler);
    return () => {
      node.removeEventListener("blur", nativeBlurHandler);
      inputRef.current = null;
      if (blurHandledRef.current || node.disabled) return;
      const value = node.value.trim();
      if (value.length > 0 && value !== (node.dataset.initial ?? "")) void saveRef.current(node.value);
    };
  }, []);

  if (mode === "viewing") {
    return <button aria-label="Enter your name" className="sand-agents-sidebar__account-name" onClick={() => setMode("editing")} type="button">Enter your name</button>;
  }

  return <input
    aria-label="Your name"
    autoComplete="off"
    className="sand-agents-sidebar__account-name-input"
    data-initial=""
    disabled={mode === "saving"}
    maxLength={200}
    onBlur={(event) => blurHandlerRef.current(event.currentTarget.value)}
    onChange={(event) => setDraft(event.currentTarget.value)}
    onFocus={() => {
      blurHandledRef.current = false;
      cancelOnBlurRef.current = false;
      viaKeyboardRef.current = false;
    }}
    onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        viaKeyboardRef.current = true;
        blurHandlerRef.current(event.currentTarget.value);
        event.currentTarget.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancelOnBlurRef.current = true;
        viaKeyboardRef.current = true;
        blurHandlerRef.current(event.currentTarget.value);
        event.currentTarget.blur();
      }
    }}
    placeholder="Enter your name"
    ref={inputRefCallback}
    spellCheck={false}
    value={draft}
  />;
}

export function AccountMenu({
  account,
  accountLabel,
  bridge,
  displayName,
  experimentsSnapshot,
  isOpen,
  updatePill,
  onError,
  onOpenAbout,
  onOpenFeedback,
  onOpenHelp,
  onOpenIos,
  onOpenSettings,
  onOpenUsage,
  onOpenChange,
  onRequestLogout,
  onStatus,
  labels
}: AccountMenuProps) {
  const [busy, setBusy] = useState(false);
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [usageSnapshot, setUsageSnapshot] = useState<{ identity: string; summary: CursorUsageSummary } | null>(null);
  const [usageOpen, setUsageOpen] = useState(false);
  useEffect(() => {
    let active = true;
    if (account?.kind !== "logged-in") {
      setAvatarDataUrl(null);
      return () => { active = false; };
    }
    void bridge.cursorAccount.getAvatar().then((value) => {
      if (active) setAvatarDataUrl(typeof value === "string" && value.length > 0 ? value : null);
    }).catch(() => {
      if (active) setAvatarDataUrl(null);
    });
    return () => { active = false; };
  }, [account?.kind, bridge]);

  useEffect(() => {
    let active = true;
    const identity = accountUsageIdentity(account);
    if (identity == null || !isOpen) {
      setUsageSnapshot(null);
      setUsageOpen(false);
      return () => { active = false; };
    }
    void bridge.cursorAccount.getUsageSummary().then((summary) => {
      if (!active) return;
      setUsageSnapshot(summary == null ? null : { identity, summary });
    }).catch(() => {
      if (active) setUsageSnapshot(null);
    });
    return () => { active = false; };
  }, [account?.kind, account?.kind === "logged-in" ? account.authId : undefined, account?.kind === "logged-in" ? account.email : undefined, bridge, isOpen]);

  const signIn = async () => {
    if (busy) return;
    setBusy(true);
    try {
      onStatus(await bridge.cursorAccount.login());
      onOpenChange(false);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };
  const closeAnd = (action: () => void) => {
    onOpenChange(false);
    action();
  };
  const showIosLink = isIosLinkEnabled(experimentsSnapshot);
  const usageNow = Date.now();
  const usageIdentity = accountUsageIdentity(account);
  const usageSummary = usageSnapshot?.identity === usageIdentity ? usageSnapshot.summary : null;
  let menuIndex = 0;
  const nextMenuIndex = () => menuIndex++;

  return (
    <div className="sand-agents-sidebar__account sand-agents-sidebar__footer" data-account-menu-open={isOpen || undefined}>
      {updatePill ?? null}
      <SandMenuRoot closeOnSelect={false} offset={4} onOpenChange={onOpenChange} open={isOpen} placement="bottom-start">
        <SandMenuTrigger>
          <button aria-expanded={isOpen} aria-haspopup="menu" aria-label={accountLabel} type="button">
            <span aria-hidden="true">{avatarDataUrl == null ? displayName.slice(0, 1).toUpperCase() : <img alt="" src={avatarDataUrl} />}</span>
            <span><strong>{displayName}</strong>{account?.kind === "logged-in" && account.email != null ? <small>{account.email}</small> : null}</span>
          </button>
        </SandMenuTrigger>
        <SandMenuContent ariaLabel={accountLabel}>
          <div data-component="menu-layout">
          {account?.kind === "logged-in" && usageSummary != null ? <>
            <SandMenuItem index={nextMenuIndex()} onSelect={() => setUsageOpen((open) => !open)}>
              {labels.weeklyUsage}<span>{percentLabel(usageSummary.sandUsagePercent)}</span>
            </SandMenuItem>
            {usageOpen ? <div aria-label={labels.weeklyUsage} role="group">
              <div><span>{usageSummary.isSandTrial ? "Trial usage" : labels.included}</span><span>{percentLabel(usageSummary.sandUsagePercent)}</span><small>{usageResetLabel(usageSummary, usageNow)}</small></div>
              {usageSummary.onDemand == null ? null : <div><span>{labels.onDemand}</span><span>{onDemandLabel(usageSummary)}</span><small>{countdownLabel(usageSummary.onDemand.resetTimestampMs, usageNow, "Resets")}</small></div>}
              <SandMenuItem index={nextMenuIndex()} onSelect={() => closeAnd(onOpenUsage)}>{labels.changeLimit}</SandMenuItem>
            </div> : null}
          </> : null}
          {showIosLink ? <SandMenuItem index={nextMenuIndex()} onSelect={() => closeAnd(onOpenIos)}>{labels.ios}</SandMenuItem> : null}
          <SandMenuItem index={nextMenuIndex()} onSelect={() => closeAnd(onOpenSettings)}>{labels.settings}</SandMenuItem>
          <SandMenuItem index={nextMenuIndex()} onSelect={() => closeAnd(onOpenAbout)}>{labels.about}</SandMenuItem>
          <SandMenuItem index={nextMenuIndex()} onSelect={() => closeAnd(onOpenHelp)}>{labels.helpCenter}</SandMenuItem>
          <SandMenuItem index={nextMenuIndex()} onSelect={() => closeAnd(onOpenFeedback)}>{labels.sendFeedback}</SandMenuItem>
          {account?.kind === "logged-in" ? <><hr /><SandMenuItem index={nextMenuIndex()} onSelect={onRequestLogout}>{labels.logOut}</SandMenuItem></> : null}
          {account?.kind === "logged-out" ? <><hr /><SandMenuItem disabled={busy} index={nextMenuIndex()} onSelect={() => void signIn()}>{labels.signIn}</SandMenuItem></> : null}
          </div>
        </SandMenuContent>
      </SandMenuRoot>
      {account?.kind === "logged-in" && account.displayName == null ? <AccountNameEditor key={account.authId ?? account.email ?? "account"} bridge={bridge} onError={onError} onStatus={onStatus} /> : null}
    </div>
  );
}

export default AccountMenu;
