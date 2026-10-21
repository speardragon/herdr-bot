/**
 * Pure validation for the New Bot (Advanced) form -- no DOM/React so it's directly
 * unit-testable. The component layer (`NewBotForm.tsx`) owns debouncing `directory.list` calls and
 * wiring the host's actual error codes (`home_cwd_requires_confirmation`, `missing_cwd`, ...) on submit;
 * this module only encodes the inline, pre-submit rules the form already knows about client-side.
 */
import type { PermissionMode, ReasoningEffort } from "../../data/types.ts";
import { isSelectableProvider, providerSupportsModel, providerSupportsReasoning } from "./provider-catalog.ts";

/** A new bot's provider and launch options. `provider` is `""` until the user picks one; `model`/
 * `reasoningEffort` stay `null` until picked -- none of them is ever prefilled with a default. */
export interface LaunchChoice {
  readonly provider: string;
  readonly model: string | null;
  readonly reasoningEffort: ReasoningEffort | null;
}

export const EMPTY_LAUNCH_CHOICE: LaunchChoice = { provider: "", model: null, reasoningEffort: null };

/** True once the provider is picked, plus its model and reasoning effort wherever the provider supports them. */
export function isLaunchChoiceComplete(choice: LaunchChoice): boolean {
  if (!isSelectableProvider(choice.provider)) return false;
  if (providerSupportsModel(choice.provider) && (choice.model == null || choice.model.length === 0)) return false;
  if (providerSupportsReasoning(choice.provider) && choice.reasoningEffort == null) return false;
  return true;
}

export interface BotFormState extends LaunchChoice {
  readonly name: string;
  readonly persona: string;
  readonly cwd: string;
  /** `null` means "agent's default" -- the host resolves its own effective default permission mode
   * (and `bot.create` omits the field entirely) rather than this form pinning a concrete mode. */
  readonly permissionMode: PermissionMode | null;
  /** Non-empty when "adopt a running agent" is selected -- launch fields (cwd/provider/model/reasoning)
   * are disabled and ignored in that mode, since adopting reuses the pane's own setup. */
  readonly adoptPaneId: string | null;
}

/** The subset of `DirectoryListing` the form's cwd validation needs -- kept narrow so tests don't have
 * to fabricate a full `DirectoryListing.entries` array. */
export interface DirectoryCheck {
  readonly exists: boolean;
  readonly isHome: boolean;
}

export interface BotFormValidation {
  readonly nameError: "required" | null;
  readonly cwdError: "not-found" | "required" | null;
  /** True when the resolved cwd is exactly the user's home directory and the form hasn't yet gotten an
   * explicit `allowHomeCwd` confirmation -- the form should show the confirmation step instead of
   * submitting (docs/app-api.md: `bot.create` rejects with `home_cwd_requires_confirmation` otherwise). */
  readonly needsHomeConfirmation: boolean;
  /** False until the provider/model/reasoning pickers are all filled in (always true when adopting). */
  readonly launchComplete: boolean;
  readonly canSubmit: boolean;
}

export function isAdopting(state: Pick<BotFormState, "adoptPaneId">): boolean {
  return state.adoptPaneId != null && state.adoptPaneId.length > 0;
}

export function validateBotForm(state: BotFormState, cwdCheck: DirectoryCheck | null, allowHomeCwd: boolean): BotFormValidation {
  const adopting = isAdopting(state);
  const nameError = state.name.trim().length === 0 ? "required" : null;

  let cwdError: BotFormValidation["cwdError"] = null;
  if (!adopting) {
    if (state.cwd.trim().length === 0) cwdError = "required";
    else if (cwdCheck != null && !cwdCheck.exists) cwdError = "not-found";
  }

  const needsHomeConfirmation = !adopting && cwdError == null && (cwdCheck?.isHome ?? false) && !allowHomeCwd;
  const launchComplete = adopting || isLaunchChoiceComplete(state);

  return {
    nameError,
    cwdError,
    needsHomeConfirmation,
    launchComplete,
    canSubmit: nameError == null && cwdError == null && !needsHomeConfirmation && launchComplete,
  };
}

/** Seeds the folder and permission mode from the defaults; the provider/model/reasoning start unpicked. */
export function emptyBotFormState(defaults: { readonly cwd: string; readonly permissionMode: PermissionMode | null }): BotFormState {
  return {
    name: "",
    persona: "",
    ...EMPTY_LAUNCH_CHOICE,
    cwd: defaults.cwd,
    permissionMode: defaults.permissionMode,
    adoptPaneId: null,
  };
}
