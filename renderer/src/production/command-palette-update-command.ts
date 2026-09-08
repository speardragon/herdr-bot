import type { DesktopUpdateStatus } from "../recovered/contracts/desktop-bridge";
import type { CommandPaletteCommand } from "./command-palette-model";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5489708 (IRn; update:app descriptor; UTF-8; SHA256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=6904652 (IRn; update:app descriptor; UTF-8; SHA256 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5)

const UPDATE_COMMAND_KEYWORDS = ["app", "check", "version", "upgrade", "install", "latest", "release", "download", "restart"] as const;

export interface CommandPaletteUpdateActions {
  /** The existing Settings Updates check path, including status recovery. */
  check(): void | Promise<unknown>;
  /** The existing Settings overlay route. */
  openSettings(): void;
  /** The existing root confirmation path around Settings Updates install. */
  openRestartConfirm(): void;
}

export interface CommandPaletteUpdateCommandInput {
  status: DesktopUpdateStatus | null;
  isStatusLoading: boolean;
  actions: CommandPaletteUpdateActions;
}

/**
 * Projects the shipped IRn update action into the recovered palette command
 * shape. Disabled and status-loading states intentionally expose no action;
 * the immutable renderer does the same before constructing its descriptor.
 */
export function commandPaletteUpdateCommand({ status, isStatusLoading, actions }: CommandPaletteUpdateCommandInput): CommandPaletteCommand | null {
  if (isStatusLoading || status?.state.type === "disabled") return null;

  const base = {
    id: "update:app",
    keywords: UPDATE_COMMAND_KEYWORDS,
    detail: "Updates"
  } as const;

  if (status == null || status.state.type === "idle") {
    return {
      ...base,
      label: "Check for Updates",
      run: () => {
        void actions.check();
        actions.openSettings();
      }
    };
  }

  switch (status.state.type) {
    case "checking":
      return { ...base, label: "Checking for Updates…", run: actions.openSettings };
    case "available":
    case "downloading":
      return { ...base, label: "Downloading Update…", run: actions.openSettings };
    case "staging":
      return { ...base, label: "Preparing Update…", run: actions.openSettings };
    case "ready":
      return { ...base, label: "Restart to Update", run: actions.openRestartConfirm };
  }
}
