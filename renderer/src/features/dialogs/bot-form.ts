/**
 * Pure validation for the New Bot (Advanced) form -- no DOM/React so it's directly
 * unit-testable. The component layer (`NewBotForm.tsx`) owns debouncing `directory.list` calls and
 * wiring the host's actual error codes (`home_cwd_requires_confirmation`, `missing_cwd`, ...) on submit;
 * this module only encodes the inline, pre-submit rules the form already knows about client-side.
 */
import type { PermissionMode, ReasoningEffort } from "../../data/types.ts";

export interface BotFormState {
  readonly name: string;
  readonly persona: string;
  readonly provider: string;
  readonly cwd: string;
  /** `null` means "agent's default" -- the host resolves its own effective default permission mode
   * (and `bot.create` omits the field entirely) rather than this form pinning a concrete mode. */
  readonly permissionMode: PermissionMode | null;
  readonly model: string | null;
  readonly reasoningEffort: ReasoningEffort | null;
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

  return {
    nameError,
    cwdError,
    needsHomeConfirmation,
    canSubmit: nameError == null && cwdError == null && !needsHomeConfirmation,
  };
}

export function emptyBotFormState(defaults: { readonly cwd: string; readonly provider: string; readonly permissionMode: PermissionMode | null }): BotFormState {
  return {
    name: "",
    persona: "",
    provider: defaults.provider,
    cwd: defaults.cwd,
    permissionMode: defaults.permissionMode,
    model: null,
    reasoningEffort: null,
    adoptPaneId: null,
  };
}
