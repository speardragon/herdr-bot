/**
 * The root surfaces historically accepted only a message string.  Keep that
 * sink as a compatibility path, but retain the operation that produced the
 * message for the typed root presenter.
 */
export type SurfaceNoticeKind = "success" | "error";

export interface SurfaceNoticeEvent<TOperation extends string> {
  readonly kind: SurfaceNoticeKind;
  readonly operation: TOperation;
  readonly message: string;
}

export type SettingsNoticeOperation =
  | "settings-load"
  | "settings-account"
  | "settings-auto-review"
  | "settings-theme"
  | "settings-local-tool-permission"
  | "settings-security-key"
  | "settings-time-zone"
  | "settings-router-provider"
  | "settings-usage-cancel-trial"
  | "settings-update-check"
  | "settings-update-install"
  | "settings-update-auto-update-when-idle"
  | "settings-update-track";

export type PluginsNoticeOperation =
  | "plugins-load"
  | "plugins-private-skills-load"
  | "plugins-private-skill-delete"
  | "plugins-private-skill-update"
  | "plugins-private-skill-toggle"
  | "plugins-private-skill-sync"
  | "plugins-authenticate"
  | "plugins-browser-remove"
  | "plugins-account-rename"
  | "plugins-account-remove"
  | "plugins-install"
  | "plugins-edit-setup"
  | "plugins-remove"
  | "plugins-server-tools-load"
  | "plugins-server-tool-toggle";

export type SettingsNoticeEvent = SurfaceNoticeEvent<SettingsNoticeOperation>;
export type PluginsNoticeEvent = SurfaceNoticeEvent<PluginsNoticeOperation>;

export type LegacyNoticeSink = (message: string) => void;

/** Send the typed event and retain the existing string-only root behavior. */
export function publishSurfaceNotice<TOperation extends string>(
  event: SurfaceNoticeEvent<TOperation>,
  onNotice?: (event: SurfaceNoticeEvent<TOperation>) => void,
  onStatus?: LegacyNoticeSink
): void {
  onNotice?.(event);
  onStatus?.(event.message);
}
