/**
 * Renderer-facing re-export of the app-api wire types. Every feature slice should import domain types
 * (`ChatSummary`, `TranscriptEntry`, ...) from here rather than reaching into `core/src/app-api/*`
 * directly -- this file is the one place that path is allowed to appear, so moving/renaming the core
 * package later only touches this barrel.
 */
export type {
  AdoptableAgent,
  AppApiErrorCode,
  AppApiErrorPayload,
  AppApiEvent,
  AppApiEventMap,
  AppApiEventType,
  AppApiMethod,
  AppApiMethods,
  AppApiParams,
  AppApiResult,
  AppSettings,
  AwaitingReason,
  BotDefaults,
  BotFacts,
  BotOnboardingState,
  BotStatus,
  ChatKind,
  ChatSummary,
  CreateBotParams,
  DirectoryListing,
  HostStatusSummary,
  MessageSearchHit,
  ModelCatalogResult,
  Terminal,
  ModelCatalogSource,
  ModelEntry,
  OnboardingLocale,
  OnboardingStage,
  PendingPrompt,
  PendingPromptOption,
  PermissionMode,
  ReasoningEffort,
  TranscriptEntry,
  TranscriptPage,
} from "../../../core/src/app-api/types.ts";

export { AppApiError, isAppApiError, toAppApiError } from "../../../core/src/app-api/errors.ts";
export { createAppClient } from "../../../core/src/app-api/client.ts";
export type { AppApiClient, AppApiClientOptions, AppApiTransport } from "../../../core/src/app-api/client.ts";
