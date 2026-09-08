// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2669942 (Hgn defaults)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2670631 (Vgn form projection)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2672195 (Ggn form validation/projection)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2695431 (h2n schedule sentence)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2696163 (x2n integration sentence)

import { isValidSchedule, normalizeSchedule, parseSchedule, type ScheduleSpec } from "./schedule";

export type GithubEvent =
  | "pr-opened"
  | "pr-pushed"
  | "pr-merged"
  | "review-requested"
  | "review-approved"
  | "review-changes-requested"
  | "review-commented"
  | "pr-comment"
  | "inline-review-comment"
  | "review-thread-resolved"
  | "review-thread-unresolved"
  | "issue-assigned"
  | "ci-passed"
  | "ci-failed";

export type SlackMatch = "message" | "keyword" | "mention" | "reaction";
export type LinearEvent = "issueCreated" | "statusChanged" | "endOfCycle";
export type SentryEvent = "issueCreated" | "issueResolved" | "issueAssigned" | "issueArchived" | "issueUnresolved" | "issueAny";
export type PagerDutyEvent = "incidentTriggered" | "incidentAcknowledged" | "incidentResolved" | "incidentEscalated" | "incidentAny";

export interface SlackTriggerForm {
  readonly platform: "slack";
  readonly channel: string;
  readonly match: SlackMatch;
  readonly keyword: string;
  readonly emoji: string;
  readonly bySelf: boolean;
}

export interface GithubTriggerForm {
  readonly platform: "github";
  readonly repo: string;
  readonly events: readonly GithubEvent[];
  readonly userAllowlist: string;
  readonly ciBranch: string;
}

export interface TeamsTriggerForm {
  readonly platform: "microsoftTeams";
  readonly tenantId: string;
  readonly teamIds: string;
  readonly channelIds: string;
  readonly messageContains: string;
  readonly messageContainsIsRegex: boolean;
  readonly blockUnauthenticatedTeamsUsers: boolean;
}

export interface LinearTriggerForm {
  readonly platform: "linear";
  readonly event: LinearEvent;
  readonly statusIds: string;
  readonly cycleIds: string;
  readonly projectIds: string;
  readonly teamIds: string;
}

export interface SentryTriggerForm {
  readonly platform: "sentry";
  readonly event: SentryEvent;
  readonly projectIds: string;
}

export interface PagerDutyTriggerForm {
  readonly platform: "pagerduty";
  readonly event: PagerDutyEvent;
  readonly serviceIds: string;
}

export type RoutineTriggerForm =
  | { readonly platform: "schedule"; readonly schedule: string }
  | SlackTriggerForm
  | GithubTriggerForm
  | TeamsTriggerForm
  | LinearTriggerForm
  | SentryTriggerForm
  | PagerDutyTriggerForm;

export interface CronListener {
  readonly type: "cron";
  readonly schedule: string;
}

export interface SlackListener {
  readonly type: "slack";
  readonly channel: string;
  readonly match: {
    readonly kind: SlackMatch;
    readonly keyword?: string;
    readonly emoji?: readonly string[];
    readonly bySelf?: boolean;
  };
}

export interface GithubListener {
  readonly type: "github";
  readonly repo: string;
  readonly events: readonly GithubEvent[];
  readonly userAllowlist?: readonly string[];
  readonly ciBranch?: string;
}

export interface TeamsListener {
  readonly type: "microsoftTeams";
  readonly tenantId: string;
  readonly teamId: string;
  readonly teamIds: readonly string[];
  readonly channelIds: readonly string[];
  readonly messageContains: string;
  readonly messageContainsIsRegex: boolean;
  readonly blockUnauthenticatedTeamsUsers: boolean;
}

export type LinearListenerEvent =
  | { readonly case: "issueCreated" }
  | { readonly case: "statusChanged"; readonly statusIds: readonly string[] }
  | { readonly case: "endOfCycle"; readonly cycleIds: readonly string[] };

export interface LinearListener {
  readonly type: "linear";
  readonly event: LinearListenerEvent;
  readonly projectIds: readonly string[];
  readonly teamIds: readonly string[];
}

export interface SentryListener {
  readonly type: "sentry";
  readonly event: { readonly case: SentryEvent };
  readonly projectIds: readonly string[];
}

export interface PagerDutyListener {
  readonly type: "pagerduty";
  readonly event: { readonly case: PagerDutyEvent };
  readonly serviceIds: readonly string[];
}

export type RoutineListener = CronListener | SlackListener | GithubListener | TeamsListener | LinearListener | SentryListener | PagerDutyListener;

export interface TriggerSentence {
  readonly lead: string;
  readonly rest: string;
}

export const GITHUB_EVENT_LABELS: Readonly<Record<GithubEvent, string>> = {
  "pr-opened": "a PR opens",
  "pr-pushed": "a PR is updated",
  "pr-merged": "a PR merges",
  "review-requested": "a review is requested",
  "review-approved": "a review approves a PR",
  "review-changes-requested": "a review requests changes",
  "review-commented": "a review comments on a PR",
  "pr-comment": "a PR comment lands",
  "inline-review-comment": "an inline review comment lands",
  "review-thread-resolved": "a review thread is resolved",
  "review-thread-unresolved": "a review thread is reopened",
  "issue-assigned": "an issue is assigned",
  "ci-passed": "CI passes",
  "ci-failed": "CI fails"
};

const SENTRY_EVENT_LABELS: Readonly<Record<SentryEvent, string>> = {
  issueCreated: "created",
  issueResolved: "resolved",
  issueAssigned: "assigned",
  issueArchived: "archived",
  issueUnresolved: "unresolved",
  issueAny: "any event"
};

const PAGERDUTY_EVENT_LABELS: Readonly<Record<PagerDutyEvent, string>> = {
  incidentTriggered: "triggered",
  incidentAcknowledged: "acknowledged",
  incidentResolved: "resolved",
  incidentEscalated: "escalated",
  incidentAny: "any event"
};

function isSentryEvent(value: unknown): value is SentryEvent {
  return value === "issueCreated" || value === "issueResolved" || value === "issueAssigned" || value === "issueArchived" || value === "issueUnresolved" || value === "issueAny";
}

function isPagerDutyEvent(value: unknown): value is PagerDutyEvent {
  return value === "incidentTriggered" || value === "incidentAcknowledged" || value === "incidentResolved" || value === "incidentEscalated" || value === "incidentAny";
}

const FLAKE = "…";
const VALID_EMOJI = /^[a-z0-9_+-]+$/;
const GITHUB_REPOSITORY = /^[^\s/]+\/[^\s/]+$/;
const INVALID_BRANCH = /[\s~^:?*[\\]|^[-/]|\/$|\.\.|@\{/;

function list(values: readonly string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} or ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, or ${values.at(-1)}`;
}

function tokens(value: string): string[] {
  return value.split(/[\s,]+/).filter((item) => item.length > 0);
}

function emojiTokens(value: string): string[] {
  const result: string[] = [];
  for (const token of tokens(value)) {
    const normalized = token.trim().replace(/^:+|:+$/g, "").split("::")[0]?.trim().toLowerCase() ?? "";
    if (normalized.length === 0 || !VALID_EMOJI.test(normalized) || result.includes(normalized)) continue;
    result.push(normalized);
    if (result.length >= 8) break;
  }
  return result;
}

function allowlist(value: string): string[] {
  const result: string[] = [];
  for (const token of tokens(value)) {
    const normalized = token.trim().replace(/^@+/, "");
    if (normalized.length > 0 && !result.some((item) => item.toLowerCase() === normalized.toLowerCase())) result.push(normalized);
  }
  return result;
}

function sentenceForSchedule(schedule: string): TriggerSentence {
  const normalized = schedule.trim();
  if (normalized.length === 0) return { lead: "Cron", rest: FLAKE };
  const parsed = parseSchedule(normalized);
  if (parsed == null) {
    const separator = normalized.indexOf(" ");
    return separator < 0 ? { lead: "Cron", rest: normalized } : { lead: normalized.slice(0, separator), rest: normalized.slice(separator + 1) };
  }
  const time = (hour: number, minute: number): string => `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
  const ordinal = (day: number): string => {
    let suffix = "th";
    if (day % 100 < 11 || day % 100 > 13) suffix = day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th";
    return `${day}${suffix}`;
  };
  switch (parsed.mode) {
    case "hourly": return { lead: "Every", rest: parsed.minute === 0 ? "hour" : `hour at :${String(parsed.minute).padStart(2, "0")}` };
    case "daily": return { lead: "Every", rest: `day at ${time(parsed.time.hour, parsed.time.minute)}` };
    case "weekdays": return { lead: "On", rest: `weekdays at ${time(parsed.time.hour, parsed.time.minute)}` };
    case "weekly": return { lead: "Every", rest: `${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][parsed.dayOfWeek] ?? String(parsed.dayOfWeek)} at ${time(parsed.time.hour, parsed.time.minute)}` };
    case "monthly": return { lead: "Monthly", rest: `on the ${ordinal(parsed.dayOfMonth)} at ${time(parsed.time.hour, parsed.time.minute)}` };
    case "interval": return { lead: "Every", rest: `${parsed.amount} ${parsed.unit.replace(/s$/, "")}${parsed.amount === 1 ? "" : "s"}` };
    case "advanced": return { lead: "Cron", rest: normalized };
  }
}

function slackSentence(trigger: SlackListener): TriggerSentence {
  const channel = trigger.channel.trim();
  const location = channel.length === 0 ? `in ${FLAKE}` : channel === "*" ? "anywhere on Slack" : `in ${channel}`;
  switch (trigger.match.kind) {
    case "message": return { lead: "New", rest: `messages ${location}` };
    case "keyword": return { lead: "New", rest: `messages containing ${trigger.match.keyword?.trim() ? `"${trigger.match.keyword.trim()}"` : FLAKE} ${location}` };
    case "mention": return { lead: "When", rest: `@mentioned ${location}` };
    case "reaction": {
      const names = (trigger.match.emoji ?? []).map((item) => `:${item}:`);
      return { lead: "Reaction", rest: `${names.length > 0 ? `${list(names)} added` : "added"}${trigger.match.bySelf ? " by me" : ""} ${location}` };
    }
  }
}

function githubSentence(trigger: GithubListener): TriggerSentence {
  const branch = trigger.ciBranch?.trim() ?? "";
  const events = trigger.events.map((event) => event === "ci-passed" || event === "ci-failed" ? `${GITHUB_EVENT_LABELS[event]}${branch.length > 0 ? ` on ${branch}` : ""}` : GITHUB_EVENT_LABELS[event]);
  return { lead: "When", rest: `${events.length > 0 ? list(events) : FLAKE} in ${trigger.repo.trim().length > 0 ? trigger.repo.trim() : FLAKE}` };
}

function teamsSentence(trigger: TeamsListener): TriggerSentence {
  const team = list(tokens(trigger.teamIds.join(" ")));
  const channels = list(tokens(trigger.channelIds.join(" ")));
  const contains = trigger.messageContains.trim();
  const tenant = trigger.tenantId.trim().length > 0 ? "" : ` (tenant ${FLAKE})`;
  return { lead: "New", rest: `messages${contains ? ` containing "${contains}"` : ""} in ${team || FLAKE}${channels ? ` (in ${channels})` : ""}${tenant}` };
}

function linearSentence(trigger: LinearListener): TriggerSentence {
  const teams = list(trigger.teamIds);
  const suffix = teams ? ` for ${teams}` : "";
  switch (trigger.event.case) {
    case "issueCreated": return { lead: "Issue", rest: `created in ${list(trigger.projectIds) || "all projects"}${suffix}` };
    case "statusChanged": return { lead: "Issue", rest: `status → ${list(trigger.event.statusIds) || "any status"} in ${list(trigger.projectIds) || "all projects"}${suffix}` };
    case "endOfCycle": return { lead: "At", rest: `end of cycle for ${teams || "all teams"}` };
  }
}

export function createRoutineTriggerForm(platform: RoutineTriggerForm["platform"]): RoutineTriggerForm | null {
  switch (platform) {
    case "schedule": return { platform, schedule: "" };
    case "slack": return { platform, channel: "", match: "message", keyword: "", emoji: "", bySelf: false };
    case "github": return { platform, repo: "", events: ["pr-opened"], userAllowlist: "", ciBranch: "" };
    case "microsoftTeams": return { platform, tenantId: "", teamIds: "", channelIds: "", messageContains: "", messageContainsIsRegex: false, blockUnauthenticatedTeamsUsers: false };
    case "linear": return { platform, event: "issueCreated", statusIds: "", cycleIds: "", projectIds: "", teamIds: "" };
    case "sentry": return { platform, event: "issueCreated", projectIds: "" };
    case "pagerduty": return { platform, event: "incidentTriggered", serviceIds: "" };
  }
}

export function listenerToRoutineTriggerForm(listener: RoutineListener): RoutineTriggerForm {
  switch (listener.type) {
    case "cron": return { platform: "schedule", schedule: listener.schedule };
    case "slack": return { platform: "slack", channel: listener.channel, match: listener.match.kind, keyword: listener.match.kind === "keyword" ? listener.match.keyword ?? "" : "", emoji: listener.match.kind === "reaction" ? (listener.match.emoji ?? []).join(", ") : "", bySelf: listener.match.kind === "reaction" && listener.match.bySelf === true };
    case "github": return { platform: "github", repo: listener.repo, events: listener.events, userAllowlist: (listener.userAllowlist ?? []).join(", "), ciBranch: listener.ciBranch ?? "" };
    case "microsoftTeams": return { platform: "microsoftTeams", tenantId: listener.tenantId, teamIds: (listener.teamIds.length > 0 ? listener.teamIds : [listener.teamId]).filter((item) => item.length > 0).join(", "), channelIds: listener.channelIds.join(", "), messageContains: listener.messageContains, messageContainsIsRegex: listener.messageContainsIsRegex, blockUnauthenticatedTeamsUsers: listener.blockUnauthenticatedTeamsUsers };
    case "linear": return { platform: "linear", event: listener.event.case, statusIds: listener.event.case === "statusChanged" ? listener.event.statusIds.join(", ") : "", cycleIds: listener.event.case === "endOfCycle" ? listener.event.cycleIds.join(", ") : "", projectIds: listener.projectIds.join(", "), teamIds: listener.teamIds.join(", ") };
    case "sentry": return { platform: "sentry", event: listener.event.case, projectIds: listener.projectIds.join(", ") };
    case "pagerduty": return { platform: "pagerduty", event: listener.event.case, serviceIds: listener.serviceIds.join(", ") };
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function routineListener(value: unknown): RoutineListener | null {
  if (!record(value) || typeof value.type !== "string") return null;
  if (value.type === "cron" && typeof value.schedule === "string") return { type: "cron", schedule: value.schedule };
  if (value.type === "slack" && typeof value.channel === "string" && record(value.match) && typeof value.match.kind === "string") {
    if (value.match.kind === "mention" || value.match.kind === "message") return { type: "slack", channel: value.channel, match: { kind: value.match.kind } };
    if (value.match.kind === "keyword" && typeof value.match.keyword === "string") return { type: "slack", channel: value.channel, match: { kind: "keyword", keyword: value.match.keyword } };
    if (value.match.kind === "reaction") {
      const emoji = Array.isArray(value.match.emoji) && value.match.emoji.every((item): item is string => typeof item === "string") ? value.match.emoji : undefined;
      return { type: "slack", channel: value.channel, match: { kind: "reaction", ...(emoji == null ? {} : { emoji }), ...(value.match.bySelf === true ? { bySelf: true } : {}) } };
    }
    return null;
  }
  if (value.type === "github" && typeof value.repo === "string" && Array.isArray(value.events) && value.events.every((item): item is GithubEvent => typeof item === "string" && item in GITHUB_EVENT_LABELS)) {
    const userAllowlist = Array.isArray(value.userAllowlist) && value.userAllowlist.every((item): item is string => typeof item === "string") ? value.userAllowlist : undefined;
    return { type: "github", repo: value.repo, events: value.events, ...(userAllowlist == null ? {} : { userAllowlist }), ...(typeof value.ciBranch === "string" ? { ciBranch: value.ciBranch } : {}) };
  }
  if (value.type === "microsoftTeams" && typeof value.tenantId === "string" && typeof value.teamId === "string" && Array.isArray(value.teamIds) && Array.isArray(value.channelIds) && value.teamIds.every((item): item is string => typeof item === "string") && value.channelIds.every((item): item is string => typeof item === "string")) {
    return { type: "microsoftTeams", tenantId: value.tenantId, teamId: value.teamId, teamIds: value.teamIds, channelIds: value.channelIds, messageContains: typeof value.messageContains === "string" ? value.messageContains : "", messageContainsIsRegex: value.messageContainsIsRegex === true, blockUnauthenticatedTeamsUsers: value.blockUnauthenticatedTeamsUsers === true };
  }
  if (value.type === "linear" && record(value.event) && (value.event.case === "issueCreated" || value.event.case === "statusChanged" || value.event.case === "endOfCycle") && Array.isArray(value.projectIds) && Array.isArray(value.teamIds) && value.projectIds.every((item): item is string => typeof item === "string") && value.teamIds.every((item): item is string => typeof item === "string")) {
    const event = value.event.case === "issueCreated" ? { case: "issueCreated" as const } : value.event.case === "statusChanged" ? { case: "statusChanged" as const, statusIds: Array.isArray(value.event.statusIds) && value.event.statusIds.every((item): item is string => typeof item === "string") ? value.event.statusIds : [] } : { case: "endOfCycle" as const, cycleIds: Array.isArray(value.event.cycleIds) && value.event.cycleIds.every((item): item is string => typeof item === "string") ? value.event.cycleIds : [] };
    return { type: "linear", event, projectIds: value.projectIds, teamIds: value.teamIds };
  }
  if (value.type === "sentry" && record(value.event) && isSentryEvent(value.event.case) && Array.isArray(value.projectIds) && value.projectIds.every((item): item is string => typeof item === "string")) return { type: "sentry", event: { case: value.event.case }, projectIds: value.projectIds };
  if (value.type === "pagerduty" && record(value.event) && isPagerDutyEvent(value.event.case) && Array.isArray(value.serviceIds) && value.serviceIds.every((item): item is string => typeof item === "string")) return { type: "pagerduty", event: { case: value.event.case }, serviceIds: value.serviceIds };
  return null;
}

function routinePlatformForm(value: Record<string, unknown>): RoutineTriggerForm | null {
  switch (value.platform) {
    case "schedule": return typeof value.schedule === "string" ? { platform: "schedule", schedule: value.schedule } : null;
    case "slack": return typeof value.channel === "string" && (value.match === "message" || value.match === "keyword" || value.match === "mention" || value.match === "reaction") && typeof value.keyword === "string" && typeof value.emoji === "string" && typeof value.bySelf === "boolean" ? { platform: "slack", channel: value.channel, match: value.match, keyword: value.keyword, emoji: value.emoji, bySelf: value.bySelf } : null;
    case "github": return typeof value.repo === "string" && Array.isArray(value.events) && value.events.every((item): item is GithubEvent => typeof item === "string" && item in GITHUB_EVENT_LABELS) && typeof value.userAllowlist === "string" && typeof value.ciBranch === "string" ? { platform: "github", repo: value.repo, events: value.events, userAllowlist: value.userAllowlist, ciBranch: value.ciBranch } : null;
    case "microsoftTeams": return typeof value.tenantId === "string" && typeof value.teamIds === "string" && typeof value.channelIds === "string" && typeof value.messageContains === "string" && typeof value.messageContainsIsRegex === "boolean" && typeof value.blockUnauthenticatedTeamsUsers === "boolean" ? { platform: "microsoftTeams", tenantId: value.tenantId, teamIds: value.teamIds, channelIds: value.channelIds, messageContains: value.messageContains, messageContainsIsRegex: value.messageContainsIsRegex, blockUnauthenticatedTeamsUsers: value.blockUnauthenticatedTeamsUsers } : null;
    case "linear": return (value.event === "issueCreated" || value.event === "statusChanged" || value.event === "endOfCycle") && typeof value.statusIds === "string" && typeof value.cycleIds === "string" && typeof value.projectIds === "string" && typeof value.teamIds === "string" ? { platform: "linear", event: value.event, statusIds: value.statusIds, cycleIds: value.cycleIds, projectIds: value.projectIds, teamIds: value.teamIds } : null;
    case "sentry": return isSentryEvent(value.event) && typeof value.projectIds === "string" ? { platform: "sentry", event: value.event, projectIds: value.projectIds } : null;
    case "pagerduty": return isPagerDutyEvent(value.event) && typeof value.serviceIds === "string" ? { platform: "pagerduty", event: value.event, serviceIds: value.serviceIds } : null;
    default: return null;
  }
}

/** Projects either the wire AutomationTrigger or the recovered platform form into staged editor rows. */
export function routineTriggerToForms(value: unknown): RoutineTriggerForm[] | null {
  if (record(value) && value.platform != null) {
    const form = routinePlatformForm(value);
    return form == null || routineTriggerFormToListener(form) == null ? null : [form];
  }
  if (record(value) && value.type === "group") {
    if (!Array.isArray(value.listeners) || value.listeners.length === 0 || value.listeners.length > 8) return null;
    const listeners = value.listeners.map(routineListener);
    const validListeners = listeners.filter((listener): listener is RoutineListener => listener != null);
    if (validListeners.length !== listeners.length) return null;
    const forms = validListeners.map(listenerToRoutineTriggerForm);
    return forms.every((form) => routineTriggerFormToListener(form) != null) ? forms : null;
  }
  const listener = routineListener(value);
  if (listener == null) return null;
  const form = listenerToRoutineTriggerForm(listener);
  return routineTriggerFormToListener(form) == null ? null : [form];
}

export function routineTriggerFormToListener(form: RoutineTriggerForm): RoutineListener | null {
  switch (form.platform) {
    case "schedule": {
      const schedule = form.schedule.trim();
      return schedule.length > 0 && isValidSchedule(schedule) ? { type: "cron", schedule } : null;
    }
    case "slack": {
      const channel = form.channel.trim();
      if (channel.length === 0) return null;
      if (form.match === "keyword") {
        const keyword = form.keyword.trim();
        return keyword.length === 0 ? null : { type: "slack", channel, match: { kind: "keyword", keyword } };
      }
      if (form.match === "reaction") {
        const emoji = emojiTokens(form.emoji);
        return { type: "slack", channel, match: { kind: "reaction", ...(emoji.length > 0 ? { emoji } : {}), ...(form.bySelf ? { bySelf: true } : {}) } };
      }
      return { type: "slack", channel, match: { kind: form.match } };
    }
    case "microsoftTeams": {
      const tenantId = form.tenantId.trim();
      const teamIds = tokens(form.teamIds);
      if (tenantId.length === 0 || teamIds.length === 0) return null;
      return { type: "microsoftTeams", tenantId, teamId: "", teamIds, channelIds: tokens(form.channelIds), messageContains: form.messageContains.trim(), messageContainsIsRegex: form.messageContainsIsRegex, blockUnauthenticatedTeamsUsers: form.blockUnauthenticatedTeamsUsers };
    }
    case "linear": {
      const event: LinearListenerEvent = form.event === "issueCreated" ? { case: form.event } : form.event === "statusChanged" ? { case: form.event, statusIds: tokens(form.statusIds) } : { case: form.event, cycleIds: tokens(form.cycleIds) };
      return { type: "linear", event, projectIds: tokens(form.projectIds), teamIds: tokens(form.teamIds) };
    }
    case "sentry": return { type: "sentry", event: { case: form.event }, projectIds: tokens(form.projectIds) };
    case "pagerduty": return { type: "pagerduty", event: { case: form.event }, serviceIds: tokens(form.serviceIds) };
    case "github": {
      const repo = form.repo.trim();
      const branch = form.ciBranch.trim();
      if (!GITHUB_REPOSITORY.test(repo) || form.events.length === 0 || (form.events.some((event) => event === "ci-passed" || event === "ci-failed") && (branch.length === 0 || INVALID_BRANCH.test(branch)))) return null;
      const users = allowlist(form.userAllowlist);
      return { type: "github", repo, events: form.events, ...(users.length > 0 ? { userAllowlist: users } : {}), ...(form.events.some((event) => event === "ci-passed" || event === "ci-failed") ? { ciBranch: branch } : {}) };
    }
  }
}

export function describeRoutineListener(listener: RoutineListener): TriggerSentence {
  switch (listener.type) {
    case "cron": return sentenceForSchedule(listener.schedule);
    case "slack": return slackSentence(listener);
    case "github": return githubSentence(listener);
    case "microsoftTeams": return teamsSentence(listener);
    case "linear": return linearSentence(listener);
    case "sentry": return { lead: "Issue", rest: `${SENTRY_EVENT_LABELS[listener.event.case]} in ${list(listener.projectIds) || "all projects"}` };
    case "pagerduty": return { lead: "Incident", rest: `${PAGERDUTY_EVENT_LABELS[listener.event.case]} on ${list(listener.serviceIds) || "all services"}` };
  }
}

export function describeRoutineTrigger(form: RoutineTriggerForm): TriggerSentence {
  const listener = routineTriggerFormToListener(form);
  return listener == null ? { lead: "Cron", rest: FLAKE } : describeRoutineListener(listener);
}

export function isRoutineTriggerFormValid(form: RoutineTriggerForm): boolean {
  return routineTriggerFormToListener(form) != null;
}

export type RoutineScheduleSpec = ScheduleSpec;
