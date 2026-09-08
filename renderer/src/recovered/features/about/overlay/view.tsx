import { useEffect, useState } from "react";
import type { DesktopBridge, DesktopUpdateStatus } from "../../../contracts/desktop-bridge";
import { rendererRuntimeAssetUrl } from "../../../../production/runtime-assets";
import { SandButton, SandIconButton } from "../../../ui/sand-kit-primitives";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L537
// Immutable root sha256: ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2195040 (app-icon URL)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5742260 (About icon consumer at 64px)

const APP_ICON_URL = rendererRuntimeAssetUrl("app-icon-C7NKj2u7.png");
const APP_ICON_SIZE_PX = 64;
const ABOUT_HEADING_ROW_CLASS = "sand-78zum5 sand-dt5ytf sand-195vfkc sand-euugli";
const ABOUT_ICON_CLASS = "sand-1lliihq sand-2lah0s sand-47corl sand-87ps6o sand-10xuot4";

export interface AboutLabels {
  title: string;
  copyright: string;
  copyVersionInfo: string;
  copied: string;
}

export interface AboutDialogProps {
  bridge: Pick<DesktopBridge, "platform" | "update">;
  labels: AboutLabels;
  onClose(): void;
  initialStatus?: DesktopUpdateStatus | null;
}

export function AboutDialog({ bridge, labels, onClose, initialStatus = null }: AboutDialogProps) {
  const [status, setStatus] = useState<DesktopUpdateStatus | null>(initialStatus);
  const [copied, setCopied] = useState(false);
  const [copyGeneration, setCopyGeneration] = useState(0);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    void bridge.update.getStatus().then((next) => active && setStatus(next));
    return () => { active = false; };
  }, [bridge]);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timeout);
  }, [copied, copyGeneration]);

  const copyVersion = async () => {
    if (status == null) return;
    try {
      await navigator.clipboard.writeText([
        `Version: ${status.currentVersion}`,
        `Release Track: ${status.currentTrack}`,
        `OS: ${bridge.platform}`
      ].join("\n"));
      setCopied(true);
      setCopyGeneration((generation) => generation + 1);
    } catch {
      // Immutable renderer suppresses clipboard rejection and leaves the action idle.
    }
  };

  return (
    <section aria-label={labels.title} aria-modal="true" className="sand-about-dialog" role="dialog">
      <SandIconButton aria-label="Close" icon="close" label="Close" onClick={onClose} size="sm" />
      <div>
        <img alt="" className={ABOUT_ICON_CLASS} draggable={false} height={APP_ICON_SIZE_PX} src={APP_ICON_URL} width={APP_ICON_SIZE_PX} />
        <div className={ABOUT_HEADING_ROW_CLASS}>
          <h2>{labels.title}</h2>
          {status == null ? null : <p>{`Version ${status.currentVersion} (built by Bennett)`}</p>}
        </div>
        <small>{labels.copyright}</small>
      </div>
      <footer><SandButton disabled={status == null} onClick={() => void copyVersion()} size="sm">{copied ? labels.copied : labels.copyVersionInfo}</SandButton></footer>
    </section>
  );
}
