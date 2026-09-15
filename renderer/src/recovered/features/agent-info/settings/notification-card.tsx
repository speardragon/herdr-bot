import { useId } from "react";
import { t } from "../../../../production/locale";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2768678 (notification copy)

export interface NotificationCardProps {
  readonly isEnabled: boolean;
  readonly isPending: boolean;
  onToggle(next: boolean): void;
}

/** The gray "알림" card with an iOS-style switch (reference); bots only -- groups never render it. */
export function NotificationCard({ isEnabled, isPending, onToggle }: NotificationCardProps) {
  const labelId = useId();
  const descriptionId = useId();
  return <div className="sand-agent-settings__card">
    <span className="sand-agent-settings__card-text">
      <span className="sand-agent-settings__card-title" id={labelId}>{t("Notifications")}</span>
      <span className="sand-agent-settings__card-subtitle" id={descriptionId}>{t("Get notified when this agent finishes or needs input", "이 Bot의 작업이 끝나거나 입력이 필요할 때 알림 받기")}</span>
    </span>
    <button
      aria-checked={isEnabled}
      aria-describedby={descriptionId}
      aria-labelledby={labelId}
      className="sand-agent-settings__switch"
      disabled={isPending}
      onClick={() => onToggle(!isEnabled)}
      role="switch"
      type="button"
    >
      <span aria-hidden="true" className="sand-agent-settings__switch-knob" />
      <span className="sand-agent-settings__sr-only">{isEnabled ? t("On") : t("Off")}</span>
    </button>
  </div>;
}
