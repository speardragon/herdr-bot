/**
 * Builds the `bot.updateLaunchSettings` params from a bot info panel's edited launch-settings form,
 * including only the fields the user actually changed -- docs/app-api.md: "the host distinguishes
 * 'field omitted' from 'field explicitly cleared' ... the UI must only include keys the user actually
 * touched, not send every field on every save." Comparing the edited form against the bot's original
 * `BotFacts` makes that distinction automatic: a field equal to its original value is omitted, one that
 * differs is included (a `null` model/reasoningEffort/permissionMode is a real, intentional "clear" --
 * for `permissionMode`, "clear" means "agent's default": the host resets to its own effective default
 * permission mode on relaunch rather than this bot keeping a pinned mode). Pure module.
 */
import type { BotFacts, PermissionMode, ReasoningEffort } from "../../data/types.ts";

export interface LaunchSettingsFormState {
  readonly cwd: string;
  readonly permissionMode: PermissionMode | null;
  readonly model: string | null;
  readonly reasoningEffort: ReasoningEffort | null;
}

export interface LaunchSettingsDiff {
  readonly cwd?: string;
  readonly permissionMode?: PermissionMode | null;
  readonly model?: string | null;
  readonly reasoningEffort?: ReasoningEffort | null;
}

export function launchSettingsFormFromFacts(bot: BotFacts): LaunchSettingsFormState {
  return { cwd: bot.cwd ?? "", permissionMode: bot.permissionMode, model: bot.model, reasoningEffort: bot.reasoningEffort };
}

/** `null` when nothing changed (the "Restart to apply" button should stay disabled); otherwise an
 * object containing only the touched keys, ready to spread into `bot.updateLaunchSettings`'s params
 * alongside `botId`/`allowHomeCwd`. */
export function diffLaunchSettings(original: BotFacts, edited: LaunchSettingsFormState): LaunchSettingsDiff | null {
  const diff: LaunchSettingsDiff = {
    ...(edited.cwd !== (original.cwd ?? "") ? { cwd: edited.cwd } : {}),
    ...(edited.permissionMode !== original.permissionMode ? { permissionMode: edited.permissionMode } : {}),
    ...(edited.model !== original.model ? { model: edited.model } : {}),
    ...(edited.reasoningEffort !== original.reasoningEffort ? { reasoningEffort: edited.reasoningEffort } : {}),
  };

  return Object.keys(diff).length > 0 ? diff : null;
}
