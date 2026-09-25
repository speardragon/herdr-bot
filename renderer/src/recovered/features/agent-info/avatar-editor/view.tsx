import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, RefObject } from "react";
import { resolvePersonaColor } from "../../onboarding/signed-in/character";
import { t, useLocale } from "../../../../production/locale";
import { AVATAR_COLORS } from "./model";
import type { AvatarEditorController, AvatarEditorSnapshot } from "./controller";
import "./view.css";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2750022 (c3n AvatarEditor view; SHA256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=3497738 (c3n AvatarEditor view; SHA256 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5)
//
// herdr-bot: a floating card under the settings hero holding just the colour palette (shape choice,
// the Generate/Upload tabs, and the Reset button were dropped). Picking a colour applies as soon as
// the coordinator round trip resolves -- staged and, if the bot already carries a saved avatar,
// committed right after -- instead of waiting for a separate "Set avatar" confirmation. Every other
// place the colour is read from (sidebar, tiles, this same hero) picks it up once that RPC succeeds
// (see ProductionRenderer's avatarCharacterChanged-gated sync effect).

export interface AvatarEditorViewProps {
  readonly controller: AvatarEditorController;
  readonly onClose: () => void;
  readonly triggerRef?: RefObject<HTMLElement | null>;
}

function useController(controller: AvatarEditorController): AvatarEditorSnapshot {
  const [snapshot, setSnapshot] = useState(controller.getSnapshot);
  useEffect(() => {
    setSnapshot(controller.getSnapshot());
    controller.setOpen(true);
    return controller.subscribe(() => setSnapshot(controller.getSnapshot()));
  }, [controller]);
  useEffect(() => () => { controller.setOpen(false); }, [controller]);
  return snapshot;
}

export function AvatarEditorView({ controller, onClose, triggerRef }: AvatarEditorViewProps) {
  useLocale();
  const snapshot = useController(controller);
  const editorRef = useRef<HTMLDivElement>(null);
  const disabled = snapshot.isSaving || snapshot.isCommitting;
  const close = () => { controller.setOpen(false); onClose(); };
  useEffect(() => {
    const editor = editorRef.current;
    if (editor == null) return;
    const onPointerDownOutside = (event: globalThis.PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node) || editor.contains(target) || triggerRef?.current?.contains(target) === true) return;
      close();
    };
    const onWindowKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      close();
    };
    document.addEventListener("pointerdown", onPointerDownOutside);
    window.addEventListener("keydown", onWindowKeyDown, true);
    editor.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("pointerdown", onPointerDownOutside);
      window.removeEventListener("keydown", onWindowKeyDown, true);
    };
  }, [triggerRef, onClose]);
  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); close(); }
  };
  const character = snapshot.stagedCharacter ?? snapshot.persistedCharacter;
  const resolvedColor = resolvePersonaColor(snapshot.agentId, character.avatarColor);
  const selectColor = async (colorId: string): Promise<void> => {
    const hadExistingAvatar = snapshot.hasExistingAvatar;
    const staged = await controller.stageCharacter({ avatarColor: colorId });
    if (staged && hadExistingAvatar) await controller.commitStagedCharacter();
  };
  return <div aria-label={t("Avatar editor", "아바타 편집")} className="sand-avatar-editor" onKeyDownCapture={onKeyDownCapture} ref={editorRef} role="dialog" tabIndex={-1}>
    <div className="sand-avatar-editor__header">
      <span className="sand-avatar-editor__label">{t("Change color", "색상 변경")}</span>
    </div>
    <div aria-label={t("Character color", "캐릭터 색상")} className="sand-avatar-editor__colors" role="group">
      {AVATAR_COLORS.map((candidate) => <button aria-label={candidate.label} aria-pressed={resolvedColor === candidate.id} className="sand-avatar-editor__color" disabled={disabled} key={candidate.id} onClick={() => void selectColor(candidate.id)} style={{ "--sand-avatar-swatch": candidate.value } as CSSProperties} title={candidate.label} type="button" />)}
    </div>
    {snapshot.error == null ? null : <div aria-live="polite" className="sand-avatar-editor__error" role="status">{snapshot.error}</div>}
  </div>;
}
