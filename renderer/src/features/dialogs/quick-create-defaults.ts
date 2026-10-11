/**
 * Resolves the New Bot (Advanced) form's starting values from the app-wide `Settings -> Defaults`
 * (`AppSettings`) overlaid on the host's own fallback (`bot.defaults()`) -- used for
 * quick-create and as the New Bot dialog's starting folder. A `Settings` field that's unset (`null`)
 * falls through to the host default; one that's set always wins.
 *
 * `permissionMode` is the one exception: `AppSettings.defaultPermissionMode: PermissionMode | null`
 * unset (`null`) means "agent's default", a real, selectable third state -- not "not configured yet, so
 * fall back to `hostDefaults.permissionMode`" (which the host has already coalesced to a concrete
 * mode). Coalescing here would make it impossible for the form's starting value to ever be "agent's
 * default" even when that is exactly what the user's settings say. Pure module, no DOM/React.
 */
import type { AppSettings, BotDefaults, PermissionMode } from "../../data/types.ts";

export interface ResolvedBotFormDefaults {
  readonly cwd: string;
  readonly provider: string;
  readonly permissionMode: PermissionMode | null;
}

export function resolveBotFormDefaults(hostDefaults: BotDefaults, settings: AppSettings | null): ResolvedBotFormDefaults {
  return {
    cwd: settings?.defaultWorkingFolder ?? hostDefaults.cwd,
    provider: settings?.defaultProvider ?? hostDefaults.provider,
    permissionMode: settings?.defaultPermissionMode ?? null,
  };
}
