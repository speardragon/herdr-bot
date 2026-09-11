/**
 * Onboarding of a "quick create" bot: a reserved profile appears instantly, then the bot is
 * provisioned asynchronously (spawn -> identity brief -> a real first greeting from the agent).
 * This module holds only the pure pieces (types, id/format helpers, and the greeting text/prompt);
 * the async state machine lives in ../services/bot-onboarding-service.ts.
 */

export type OnboardingStage = "provisioning" | "briefing" | "greeting" | "ready" | "failed";

export interface BotOnboarding {
  readonly requestId: string;
  readonly locale: "ko" | "en";
  readonly stage: OnboardingStage;
  readonly error: string | null;
}

export interface QuickCreateRequest {
  readonly requestId: string;
  readonly locale: "ko" | "en";
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
 * always resolves to the same profile. It is intentionally longer than a hand-authored bot id and
 * must never be run through {@link isValidBotId} -- the reserved provision path skips that check.
 */
export function reservedBotId(requestId: string): string {
  return `bot-${requestId}`;
}

export function greetingText(locale: "ko" | "en"): string {
  return locale === "ko"
    ? "안녕하세요. 앞으로 같이 일할 준비가 됐어요. 제일 먼저, 저를 어떤 일에 가장 쓰고 싶으세요?"
    : "Hello. I’m ready to work with you. First, what would you most like to use me for?";
}

export function buildGreetingPrompt(chatId: string, locale: "ko" | "en"): string {
  return [
    "[herdr-bot onboarding] This is an internal setup instruction, not a user message.",
    `Send exactly one message to your own DM ${JSON.stringify(chatId)} using the instructed say command.`,
    `The exact message is: ${JSON.stringify(greetingText(locale))}`,
    "Do not edit files, invoke external services, or perform a task yet. Wait for the user's answer.",
    "After their answer, develop your role conversationally. Do not claim a profile change was saved unless it was.",
  ].join("\n");
}
