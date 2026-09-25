/**
 * Onboarding of a "quick create" bot: a reserved profile appears instantly, then the bot is
 * provisioned asynchronously (spawn -> identity brief -> a real first greeting from the agent).
 * This module holds only the pure pieces (types, id/format helpers, and the greeting text/prompt);
 * the async state machine lives in ../services/bot-onboarding-service.ts.
 */

export type OnboardingStage = "provisioning" | "briefing" | "greeting" | "ready" | "failed";
export type OnboardingLocale = "ko" | "en";

export interface BotOnboarding {
  readonly requestId: string;
  readonly locale: OnboardingLocale;
  readonly stage: OnboardingStage;
  readonly error: string | null;
}

export interface QuickCreateRequest {
  readonly requestId: string;
  readonly locale: OnboardingLocale;
  /** Trimmed, non-empty name typed into the "+" combobox before an untitled create; omitted (or
   * blank) falls back to a plain "새 Bot"/"New Bot" the user renames later. */
  readonly name?: string;
  /** A persona color id (e.g. "blue"; see renderer avatar-editor/model.ts AVATAR_COLORS) picked
   * before the very first bot exists to create -- same free-form field the profile-edit RPC already
   * accepts (dispatcher.ts updateAgent), not re-validated against a fixed list here either. */
  readonly avatarColor?: string;
}

/** Marks the transcript entry that stores the agent's own first greeting (see chat-service). */
export const ONBOARDING_ORIGIN = "onboarding";

/** The renderer mints a UUID per create button press and reuses it across double-clicks / retries. */
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidRequestId(value: string): boolean {
  return REQUEST_ID_PATTERN.test(value);
}

/**
 * A reserved bot's id is derived from (not the same as) the request UUID so the same button press
 * always resolves to the same profile. The id doubles as the herdr agent name, and herdr accepts
 * `[a-z][a-z0-9_-]{0,31}` -- a full UUID ("bot-" + 36) is rejected, which used to fail every quick
 * create at `agent start`. The first 12 hex digits keep it deterministic and comfortably unique.
 * It must never be run through {@link isValidBotId} -- the reserved provision path skips that check.
 */
export function reservedBotId(requestId: string): string {
  return `bot-${requestId.replace(/-/g, "").slice(0, 12).toLowerCase()}`;
}

/** herdr's live agent-name rule (herdr --skill): the reserved id has to satisfy it to be spawnable. */
export const HERDR_AGENT_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

/** The bot's first message: it greets the user and asks the onboarding question in ordinary chat. */
export function greetingText(locale: OnboardingLocale): string {
  return locale === "ko"
    ? "안녕하세요. 뭐든 편하게 맡겨 주세요.\n\n저를 주로 어디에 쓰고 싶으세요?"
    : "Hello. Hand me anything you like.\n\nWhat I’m most curious about is what you mainly want to use me for?";
}
