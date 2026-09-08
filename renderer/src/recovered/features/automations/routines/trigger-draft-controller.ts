// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=2699636 (P2n)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=2639330 (NUe=8 trigger-row cap)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#sha256=80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5#byteOffset=3364688 (NUe=8 trigger-row cap)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=2699390 (15-minute schedule picker interval, not row limit)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=2700107 (sand-trigger-card)

import { isValidSchedule, normalizeSchedule } from "./schedule";
import { routineTriggerFormToListener, type RoutineListener, type RoutineTriggerForm } from "./trigger-schema";

const MAX_TRIGGER_ROWS = 8;

export interface RoutineTriggerDraft {
  readonly rows: readonly RoutineTriggerForm[];
}

type AutomationCronTrigger = { readonly type: "cron"; readonly schedule: string };
type AutomationSlackTrigger = { readonly type: "slack"; readonly channel: string; readonly match: { readonly kind: "mention" | "message" } | { readonly kind: "keyword"; readonly keyword: string } | { readonly kind: "reaction"; readonly emoji?: readonly string[]; readonly bySelf?: boolean } };
type AutomationGithubTrigger = { readonly type: "github"; readonly repo: string; readonly events: readonly string[]; readonly ciBranch?: string; readonly userAllowlist?: readonly string[] };
type AutomationTeamsTrigger = { readonly type: "microsoftTeams"; readonly tenantId: string; readonly teamId: string; readonly teamIds: readonly string[]; readonly channelIds: readonly string[]; readonly messageContains: string; readonly messageContainsIsRegex: boolean; readonly blockUnauthenticatedTeamsUsers: boolean };
type AutomationLinearTrigger = { readonly type: "linear"; readonly event: { readonly case: "issueCreated" } | { readonly case: "statusChanged"; readonly statusIds: readonly string[] } | { readonly case: "endOfCycle"; readonly cycleIds: readonly string[] }; readonly projectIds: readonly string[]; readonly teamIds: readonly string[] };
type AutomationSentryTrigger = { readonly type: "sentry"; readonly event: { readonly case: string }; readonly projectIds: readonly string[] };
type AutomationPagerDutyTrigger = { readonly type: "pagerduty"; readonly event: { readonly case: string }; readonly serviceIds: readonly string[] };
type AutomationTriggerMember = AutomationCronTrigger | AutomationSlackTrigger | AutomationGithubTrigger | AutomationTeamsTrigger | AutomationLinearTrigger | AutomationSentryTrigger | AutomationPagerDutyTrigger;
type AutomationTrigger = AutomationTriggerMember | { readonly type: "group"; readonly listeners: readonly [AutomationTriggerMember, AutomationTriggerMember, ...AutomationTriggerMember[]] };

/** The generated AutomationTrigger shape accepted by the existing RPC spec. */
export type RoutineAutomationTrigger = AutomationTrigger;

function triggerFromList(members: readonly AutomationTriggerMember[]): AutomationTrigger | null {
  const first = members[0];
  const second = members[1];
  return first == null ? null : second == null ? first : { type: "group", listeners: [first, second, ...members.slice(2)] };
}

function toAutomationTriggerMember(listener: RoutineListener): AutomationTriggerMember {
  switch (listener.type) {
    case "cron": return { type: "cron", schedule: listener.schedule };
    case "slack": {
      const match = listener.match;
      return {
        type: "slack",
        channel: listener.channel,
        match: match.kind === "keyword"
          ? { kind: "keyword", keyword: match.keyword ?? "" }
          : match.kind === "reaction"
            ? { kind: "reaction", ...(match.emoji == null ? {} : { emoji: [...match.emoji] }), ...(match.bySelf === true ? { bySelf: true } : {}) }
            : { kind: match.kind }
      };
    }
    case "github": return {
      type: "github",
      repo: listener.repo,
      events: [...listener.events],
      ...(listener.userAllowlist == null ? {} : { userAllowlist: [...listener.userAllowlist] }),
      ...(listener.ciBranch == null ? {} : { ciBranch: listener.ciBranch })
    };
    case "microsoftTeams": return {
      type: "microsoftTeams",
      tenantId: listener.tenantId,
      teamId: listener.teamId,
      teamIds: [...listener.teamIds],
      channelIds: [...listener.channelIds],
      messageContains: listener.messageContains,
      messageContainsIsRegex: listener.messageContainsIsRegex,
      blockUnauthenticatedTeamsUsers: listener.blockUnauthenticatedTeamsUsers
    };
    case "linear": return {
      type: "linear",
      event: listener.event.case === "issueCreated"
        ? { case: "issueCreated" }
        : listener.event.case === "statusChanged"
          ? { case: "statusChanged", statusIds: [...listener.event.statusIds] }
          : { case: "endOfCycle", cycleIds: [...listener.event.cycleIds] },
      projectIds: [...listener.projectIds],
      teamIds: [...listener.teamIds]
    };
    case "sentry": return { type: "sentry", event: { case: listener.event.case }, projectIds: [...listener.projectIds] };
    case "pagerduty": return { type: "pagerduty", event: { case: listener.event.case }, serviceIds: [...listener.serviceIds] };
  }
}

/**
 * Converts staged P2n rows to the existing host trigger shape. Rows are
 * independent members: one member stays scalar, while two through eight are
 * represented by the existing group/listeners form. No RPC or model widening
 * is required, and malformed or empty drafts fail closed.
 */
export function serializeRoutineTriggerDraft(draft: RoutineTriggerDraft): RoutineAutomationTrigger | null {
  if (draft.rows.length === 0 || draft.rows.length > MAX_TRIGGER_ROWS) return null;
  const members: AutomationTriggerMember[] = [];
  for (const row of draft.rows) {
    const member = routineTriggerFormToListener(row);
    if (member == null) return null;
    members.push(toAutomationTriggerMember(member));
  }
  return triggerFromList(members);
}

export type TriggerDraftPersistence = void | Promise<void>;

export interface RoutineTriggerDraftPersistence {
  /** Mirrors P2n's onDraftChange for raw, uncommitted field edits. */
  onDraftChange(draft: RoutineTriggerDraft): void;
  /** Mirrors P2n's onDraftCommit for a valid draft. */
  onDraftCommit(draft: RoutineTriggerDraft): TriggerDraftPersistence;
  /** Mirrors P2n's close-time commit/revert callback. */
  onCommitOrRevertDraft(draft: RoutineTriggerDraft): TriggerDraftPersistence;
  /** Full trigger validation remains injected because integration schemas are private to the shipped chunk. */
  isDraftValid?(draft: RoutineTriggerDraft): boolean;
}

export type TriggerEditorCloseReason = "cancel" | "outside" | "escape";

export interface RoutineTriggerDraftSnapshot {
  readonly draft: RoutineTriggerDraft;
  readonly lastValidDraft: RoutineTriggerDraft;
  readonly menuOpen: boolean;
  readonly editingRow: number | null;
  readonly customInvalid: boolean;
  readonly hoveredRow: number | null;
  readonly focusReturnRow: number | null;
  readonly pending: boolean;
  readonly error: unknown | null;
}

function cloneDraft(draft: RoutineTriggerDraft): RoutineTriggerDraft {
  return { rows: [...draft.rows] };
}

function defaultDraftValid(draft: RoutineTriggerDraft): boolean {
  return serializeRoutineTriggerDraft(draft) != null;
}

/**
 * The unmounted, persistence-injected P2n state machine. It deliberately has
 * no bridge knowledge: the parent supplies the exact coordinator callback
 * shape and the private integration validator when it becomes available.
 */
export function createRoutineTriggerDraftController(initialDraft: RoutineTriggerDraft, persistence: RoutineTriggerDraftPersistence) {
  let draft = cloneDraft(initialDraft);
  let lastValidDraft = cloneDraft(initialDraft);
  let menuOpen = false;
  let editingRow: number | null = null;
  let customInvalid = false;
  let hoveredRow: number | null = null;
  let focusReturnRow: number | null = null;
  let pending = false;
  let error: unknown | null = null;
  let disposed = false;
  let mutationToken = 0;
  let menuMutation = false;
  let skipNextMenuCommit = false;
  const listeners = new Set<() => void>();

  const isDraftValid = persistence.isDraftValid ?? defaultDraftValid;
  const snapshot = (): RoutineTriggerDraftSnapshot => ({
    draft: cloneDraft(draft),
    lastValidDraft: cloneDraft(lastValidDraft),
    menuOpen,
    editingRow,
    customInvalid,
    hoveredRow,
    focusReturnRow,
    pending,
    error
  });
  const notify = () => {
    if (!disposed) for (const listener of listeners) listener();
  };
  const valid = (next: RoutineTriggerDraft): boolean => isDraftValid(next);
  const rawChange = (next: RoutineTriggerDraft): void => {
    if (disposed) return;
    draft = cloneDraft(next);
    persistence.onDraftChange(cloneDraft(draft));
    notify();
  };
  const persist = async (next: RoutineTriggerDraft, callback: (value: RoutineTriggerDraft) => TriggerDraftPersistence): Promise<boolean> => {
    if (disposed || pending || !valid(next)) return false;
    const token = ++mutationToken;
    pending = true;
    error = null;
    notify();
    try {
      await callback(cloneDraft(next));
      if (disposed || token !== mutationToken) return false;
      lastValidDraft = cloneDraft(next);
      pending = false;
      notify();
      return true;
    } catch (cause) {
      if (!disposed && token === mutationToken) {
        error = cause;
        pending = false;
        notify();
      }
      return false;
    }
  };
  const commitCurrent = async (): Promise<boolean> => {
    if (!valid(draft)) return false;
    return persist(draft, persistence.onDraftCommit);
  };
  const closeMenu = async (): Promise<boolean> => {
    if (disposed) return false;
    menuOpen = false;
    if (menuMutation) {
      menuMutation = false;
      notify();
      return false;
    }
    if (skipNextMenuCommit) {
      skipNextMenuCommit = false;
      notify();
      return false;
    }
    const result = await persist(lastValidDraft, persistence.onCommitOrRevertDraft);
    return result;
  };
  const openMenu = (): void => {
    if (disposed) return;
    menuOpen = true;
    error = null;
    notify();
  };

  return {
    subscribe(listener: () => void): () => void {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot,
    openMenu(): void {
      openMenu();
    },
    async setMenuOpen(open: boolean): Promise<boolean> {
      if (open) {
        openMenu();
        return false;
      }
      return closeMenu();
    },
    handleMenuEscape(): Promise<boolean> {
      return closeMenu();
    },
    setHoveredRow(row: number | null): void {
      if (disposed) return;
      hoveredRow = row;
      notify();
    },
    openEditor(row: number): void {
      if (disposed || row < 0 || row >= draft.rows.length) return;
      menuOpen = false;
      customInvalid = false;
      editingRow = row;
      focusReturnRow = null;
      notify();
    },
    async closeEditor(reason: TriggerEditorCloseReason = "cancel"): Promise<boolean> {
      if (disposed) return false;
      const row = editingRow;
      if (row == null) return false;
      editingRow = null;
      customInvalid = false;
      const result = await persist(lastValidDraft, persistence.onCommitOrRevertDraft);
      if (!disposed) {
        focusReturnRow = row;
        notify();
      }
      return result;
    },
    replaceDraft(next: RoutineTriggerDraft): void {
      rawChange(next);
    },
    updateRow(row: number, value: RoutineTriggerForm, commit = false): Promise<boolean> {
      if (disposed || row < 0 || row >= draft.rows.length) return Promise.resolve(false);
      const next = { rows: draft.rows.map((item, index) => index === row ? value : item) };
      customInvalid = false;
      rawChange(next);
      return commit ? commitCurrent() : Promise.resolve(false);
    },
    updateCustomSchedule(row: number, value: string): Promise<boolean> {
      const next: RoutineTriggerForm = { platform: "schedule", schedule: value };
      return this.updateRow(row, next, false);
    },
    blurCustomSchedule(row: number, value: string): Promise<boolean> {
      if (disposed || row < 0 || row >= draft.rows.length) return Promise.resolve(false);
      const schedule = normalizeSchedule(value);
      customInvalid = schedule.length > 0 && !isValidSchedule(schedule);
      const replacement: RoutineTriggerForm = { platform: "schedule", schedule };
      const next: RoutineTriggerDraft = { rows: draft.rows.map((item, index) => index === row ? replacement : item) };
      rawChange(next);
      return customInvalid ? Promise.resolve(false) : commitCurrent();
    },
    addRow(value: RoutineTriggerForm, openEditor = false): Promise<boolean> {
      if (disposed || pending || draft.rows.length >= MAX_TRIGGER_ROWS) return Promise.resolve(false);
      menuMutation = true;
      skipNextMenuCommit = false;
      const next = { rows: [...draft.rows, value] };
      rawChange(next);
      if (openEditor) {
        editingRow = next.rows.length - 1;
        menuOpen = false;
        focusReturnRow = null;
        notify();
      }
      return openEditor ? commitCurrent() : Promise.resolve(false);
    },
    addRowAndCommit(value: RoutineTriggerForm): Promise<boolean> {
      if (disposed || pending || draft.rows.length >= MAX_TRIGGER_ROWS) return Promise.resolve(false);
      menuMutation = true;
      skipNextMenuCommit = false;
      rawChange({ rows: [...draft.rows, value] });
      return commitCurrent();
    },
    removeRow(row: number): Promise<boolean> {
      if (disposed || row < 0 || row >= draft.rows.length) return Promise.resolve(false);
      menuOpen = false;
      editingRow = null;
      customInvalid = false;
      if (draft.rows.length <= 1) {
        skipNextMenuCommit = true;
        rawChange({ rows: [] });
        return Promise.resolve(false);
      }
      const next = { rows: draft.rows.filter((_, index) => index !== row) };
      rawChange(next);
      return commitCurrent();
    },
    clearFocusReturnRow(): void {
      focusReturnRow = null;
      notify();
    },
    reset(next: RoutineTriggerDraft = initialDraft): void {
      if (disposed) return;
      mutationToken += 1;
      draft = cloneDraft(next);
      lastValidDraft = cloneDraft(next);
      menuOpen = false;
      editingRow = null;
      customInvalid = false;
      hoveredRow = null;
      focusReturnRow = null;
      pending = false;
      error = null;
      menuMutation = false;
      skipNextMenuCommit = false;
      notify();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      mutationToken += 1;
      pending = false;
      listeners.clear();
    }
  };
}

export type RoutineTriggerDraftController = ReturnType<typeof createRoutineTriggerDraftController>;
