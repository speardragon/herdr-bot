// @evidence src/app/dist/renderer/assets/view-Cbx1-ckK.js#L1; sha256=fbfdc478ef93d56fe0ca83dfe46781c58ea7fd66577ea8befbadd192472e4632
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { hiddenChatNameId, openHiddenChat, type HiddenAgentSummary, type HiddenChatsOverlayModel } from "./model";
import { SandIcon, SandIconButton } from "../../../ui/sand-kit-primitives";
import "./view.css";

export interface HiddenChatsDialogProps extends HiddenChatsOverlayModel {
  renderAvatar?: (agent: HiddenAgentSummary) => ReactNode;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase() ?? "")
    .join("");
}

function EyeSlashIcon() {
  return <SandIcon name="eye-slash" size="2xl" />;
}

export function HiddenChatsDialog({
  hiddenAgents,
  isOpen,
  onClose,
  onOpenAgent,
  onUnhide,
  renderAvatar
}: HiddenChatsDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = "sand-hidden-chats-title";
  const descriptionId = "sand-hidden-chats-description";

  useEffect(() => {
    if (!isOpen) return;
    const activeElement = document.activeElement;
    returnFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    dialogRef.current?.focus();
    const onPointerDownOutside = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node && !dialogRef.current?.contains(target)) onClose();
    };
    const onFocusOutside = (event: FocusEvent): void => {
      const target = event.target;
      if (target instanceof Node && !dialogRef.current?.contains(target)) dialogRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDownOutside);
    document.addEventListener("focusin", onFocusOutside);
    return () => {
      document.removeEventListener("pointerdown", onPointerDownOutside);
      document.removeEventListener("focusin", onFocusOutside);
      const returnFocusTarget = returnFocusRef.current;
      returnFocusRef.current = null;
      if (returnFocusTarget?.isConnected) returnFocusTarget.focus({ preventScroll: true });
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
    ) ?? [])].filter((element) => element.getAttribute("aria-hidden") !== "true");
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      aria-label="Hidden Bots"
      aria-modal="true"
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className="sand-hidden-chats-dialog sand-1348h9v"
      onKeyDown={onKeyDown}
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <header className="sand-z9dl7a sand-cicffo sand-sag5q8 sand-19145p9">
        <div>
          <h2 id={titleId}>Hidden Bots</h2>
          <p className="sand-1o0liin" id={descriptionId}>Hidden Bots stay active and keep their history, they just don&apos;t show in the sidebar.</p>
        </div>
        <SandIconButton aria-label="Close" icon="close" onClick={onClose} size="sm" />
      </header>

      <div className="sand-78zum5 sand-dt5ytf sand-1iyjqo2 sand-2lwn1j sand-exx8yu sand-18d9i69">
        {hiddenAgents.length === 0 ? (
          <div className="sand-hidden-chats__empty sand-78zum5 sand-dt5ytf sand-6s0dn4 sand-l56j7k sand-w09woa sand-1iyjqo2 sand-2b8uid">
            <EyeSlashIcon />
            <span className="sand-1o0liin">No hidden bots</span>
          </div>
        ) : (
          <div className="sand-hidden-chats__list sand-yamay9 sand-1dbijih">
            {hiddenAgents.map((agent) => {
              const nameId = hiddenChatNameId(agent.id);
              return (
                <div aria-labelledby={nameId} className="sand-hidden-chats__row sand-78zum5 sand-1q0g3np sand-6s0dn4 sand-fex06f sand-1aewyqy sand-1qmwy7c sand-jbqb8w sand-aalx5g" key={agent.id} role="group">
                  <button className="sand-hidden-chats__open sand-jyslct sand-1lugfcp sand-78zum5 sand-1q0g3np sand-6s0dn4 sand-fex06f sand-1iyjqo2 sand-euugli sand-1yrsyyn sand-1xpa7k sand-10b6aqq sand-163pfp sand-1ghz6dp sand-ng3xce sand-1qmwy7c sand-jbqb8w sand-1heor9g sand-jb2p0i sand-dpxx8g sand-1ypdohk" onClick={() => openHiddenChat(onClose, onOpenAgent, agent.id)} type="button">
                    <span aria-hidden="true">
                      {renderAvatar?.(agent) ?? initials(agent.name)}
                    </span>
                    <span className="sand-euugli sand-1iyjqo2 sand-b3r6kr sand-lyipyv sand-uxw1ft sand-tyxrsu" id={nameId}>{agent.name}</span>
                  </button>
                  <span className="sand-2lah0s sand-y13l1i"><button className="sand-hidden-chats__unhide sand-1o0liin" onClick={() => onUnhide(agent.id)} type="button">Unhide</button></span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export type HiddenChatsModelHook = () => HiddenChatsOverlayModel;

export function createHiddenChatsOverlayView(useModel: HiddenChatsModelHook) {
  return function HiddenChatsOverlayView() {
    return <HiddenChatsDialog {...useModel()} isOpen />;
  };
}

export default function HiddenChatsOverlaySourceBoundary(_props: { params: Record<string, never> }) {
  return null;
}
