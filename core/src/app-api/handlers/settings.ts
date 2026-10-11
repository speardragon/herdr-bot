/** Handlers for settings.*, directory.*, identity.get, and host.status. */
import type { Host } from "../../host.ts";
import { isSupportedKind } from "../../bots/launch-args.ts";
import { isHomeDirectory, listDirectories } from "../../services/directory-browser.ts";
import type { PermissionMode } from "../../store/profile-store.ts";
import { AppApiError } from "../errors.ts";
import type { AppSettings, DirectoryListing, HostStatusSummary } from "../types.ts";
import { optStr, record } from "../validate.ts";

export function getAppSettings(host: Host): AppSettings {
  return host.roster.getAppSettings();
}

export function updateAppSettings(host: Host, raw: unknown): AppSettings {
  const params = record(raw);
  const folder = optStr(params, "defaultWorkingFolder");
  const provider = optStr(params, "defaultProvider");
  if (provider != null && !isSupportedKind(provider)) throw new AppApiError("unsupported_kind", `herdr does not support agent kind "${provider}"`);
  const mode = params.defaultPermissionMode === "ask" || params.defaultPermissionMode === "auto" ? (params.defaultPermissionMode as PermissionMode) : null;
  return host.roster.updateAppSettings({
    ...("defaultWorkingFolder" in params ? { defaultWorkingFolder: folder ?? null } : {}),
    ...("defaultProvider" in params ? { defaultProvider: provider ?? null } : {}),
    ...("defaultPermissionMode" in params ? { defaultPermissionMode: mode } : {}),
  });
}

export function listDirectoriesHandler(_host: Host, raw: unknown): DirectoryListing {
  const params = record(raw);
  const path = optStr(params, "path") ?? "";
  const listing = listDirectories(path);
  return { exists: listing.exists, isHome: isHomeDirectory(path), entries: listing.entries };
}

export function getIdentity(host: Host): { readonly userName: string } {
  return { userName: host.config.userName };
}

export function getHostStatus(host: Host): HostStatusSummary {
  const status = host.status();
  return { home: status.home, session: status.session, bots: status.bots, rooms: status.rooms, runningChatIds: status.runningTurns };
}
