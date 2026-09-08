// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2707000
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2716759
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2733813
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2721225 (sand-automation-detail)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2707027 (sand-trigger-card)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2741174 (sand-routine__list)

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import type { DesktopTimeZoneState } from "../../../contracts/desktop-bridge";
import type { RoutineAutomation, RoutineSpec, RoutineTrigger, RoutinesController } from "./controller";
import { browserRoutineRunHistoryScheduler, createRoutineRunHistoryClockOwner, detectRoutineRunHistoryTimeZone } from "./run-history-clock";
import { createRoutineRunHistoryProvider, type RoutineRunHistoryScope, type RoutineRunHistorySnapshot } from "./run-history-provider";
import type { RoutineRunPresentation } from "./run-history";
import { routineTriggerToForms } from "./trigger-schema";
import { RoutineTriggerDraftEditor } from "./schedule-editor";
import "./view.css";

export interface RoutinesInfoPaneMount {
  readonly agentId: string;
  readonly automationId?: string | null;
  readonly controller: RoutinesController;
  readonly accountKey?: string | null;
  readonly timeZone?: DesktopTimeZoneState;
  readonly reconnectKey?: string | number;
  readonly onBack?: () => void;
  readonly onClose?: () => void;
  readonly disposeOnUnmount?: boolean;
}

export interface RoutinesInfoPaneProps extends RoutinesInfoPaneMount {
  readonly automationId?: string | null;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRoutineTrigger(value: unknown): value is RoutineTrigger {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2718133 (run-history projection)
function runStatus(row: RoutineRunPresentation): ReactNode {
  const className = row.iconName === "loading"
    ? "sand-n3e42v sand-1so62im sand-r5sbw0 sand-1aquc0h sand-1m9vv7p sand-1esw782 sand-a4qsjk"
    : row.iconName === "check" ? "sand-1le6hhr" : "sand-6rl5ky";
  return <span aria-label={row.ariaLabel} className={className} data-icon-name={row.iconName} role={row.statusRole} />;
}

function RoutineFields({
  automation,
  name,
  prompt,
  trigger,
  create,
  onNameChange,
  onPromptChange,
  onNameCommit,
  onPromptCommit,
  onTriggerChange,
  saveError,
  pending,
  runHistory
}: {
  automation: RoutineAutomation | null;
  name: string;
  prompt: string;
  trigger: RoutineTrigger | null;
  create: boolean;
  onNameChange(value: string): void;
  onPromptChange(value: string): void;
  onNameCommit(): void;
  onPromptCommit(): void;
  onTriggerChange(trigger: unknown): void;
  saveError: unknown | null;
  pending: boolean;
  runHistory: RoutineRunHistorySnapshot;
}) {
  const nameId = useId();
  const promptId = useId();
  const triggerId = useId();
  const nameInvalid = name.trim().length === 0;
  const promptInvalid = prompt.trim().length === 0;
  const triggerInvalid = trigger == null || routineTriggerToForms(trigger) == null;
  const commitName = () => { if (!create && nameInvalid) return; onNameCommit(); };
  const commitPrompt = () => { if (!create && promptInvalid) return; onPromptCommit(); };

  return (
    <div className="sand-automation-detail sand-78zum5 sand-dt5ytf sand-1iyjqo2 sand-s83m0k sand-dl72j9" aria-busy={pending ? "true" : undefined}>
      {saveError == null ? null : <div aria-live="polite" role="status">Couldn't save this routine.</div>}
      <label htmlFor={nameId}>Name</label>
      <input
        aria-label="Name"
        aria-invalid={nameInvalid || undefined}
        autoFocus={create}
        id={nameId}
        onBlur={commitName}
        onChange={(event) => onNameChange(event.currentTarget.value)}
        placeholder="Name this routine"
        required
        type="text"
        value={name}
      />
      <label htmlFor={promptId}>Instruction</label>
      <textarea
        aria-label="Instruction"
        aria-invalid={promptInvalid || undefined}
        id={promptId}
        onBlur={commitPrompt}
        onChange={(event) => onPromptChange(event.currentTarget.value)}
        placeholder="What should this routine do each time it runs?"
        required
        value={prompt}
      />
      <label htmlFor={triggerId}>When to run</label>
      <div aria-invalid={triggerInvalid || undefined} className="sand-trigger-card" id={triggerId}>
        <RoutineTriggerDraftEditor onCommit={onTriggerChange} pending={pending} trigger={trigger} />
      </div>
      {automation == null ? null : <RoutineRunHistory snapshot={runHistory} />}
    </div>
  );
}

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=2718133 (run-history list/row/empty selectors)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#sha256=80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5#byteOffset=3466930 (Windows run-history list/row/empty selectors)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2708451 (run status icon styles)
const RUN_HISTORY_LIST_CLASS = "sand-e8uvvx sand-78zum5 sand-dt5ytf sand-195vfkc sand-dj266r sand-1yf7rl7 sand-at24cr sand-j3b58b sand-1717udv";
const RUN_HISTORY_ROW_CLASS = "sand-78zum5 sand-6s0dn4 sand-167g77z sand-9f619 sand-1gnnpzl sand-1yrsyyn sand-y13l1i sand-10b6aqq sand-163pfp sand-1m7fhj7";
const RUN_HISTORY_EMPTY_CLASS = "sand-1yrsyyn sand-y13l1i sand-10b6aqq sand-163pfp";

function RoutineRunHistory({ snapshot }: { snapshot: RoutineRunHistorySnapshot }) {
  const presentation = { empty: snapshot.rows.length === 0, rows: snapshot.rows };
  return (
    <div className="sand-78zum5 sand-dt5ytf">
      <span>Run history</span>
      {presentation.empty ? <div className={RUN_HISTORY_EMPTY_CLASS}><span>No runs yet</span></div> : (
        <ul aria-label="Run history" className={RUN_HISTORY_LIST_CLASS}>
          {presentation.rows.map((row) => <li className={RUN_HISTORY_ROW_CLASS} key={row.id} title={row.title}><span>{row.timestampLabel}</span>{runStatus(row)}</li>)}
        </ul>
      )}
    </div>
  );
}

function RoutineEditor({
  agentId,
  automation,
  controller,
  runHistory,
  onCreated,
  onDeleted,
  onBack
}: {
  agentId: string;
  automation: RoutineAutomation | null;
  controller: RoutinesController;
  runHistory: RoutineRunHistorySnapshot;
  onCreated(id: string): void;
  onDeleted(): void;
  onBack(): void;
}) {
  const [name, setName] = useState(automation?.name ?? "");
  const [prompt, setPrompt] = useState(automation?.prompt ?? "");
  const [trigger, setTrigger] = useState<RoutineTrigger | null>(automation?.trigger ?? null);
  const focusRef = useRef<HTMLDivElement>(null);
  const create = automation == null;
  const pending = create ? controller.createPending(agentId) : controller.pending(agentId, automation.id);
  const saveError = controller.mutationError(agentId, create ? "create" : automation.id);
  const spec = useMemo<RoutineSpec | null>(() => {
    const trimmedName = name.trim();
    const trimmedPrompt = prompt.trim();
    if (trimmedName.length === 0 || trimmedPrompt.length === 0 || trigger == null) return null;
    return { name: trimmedName, prompt: trimmedPrompt, trigger, isEnabled: automation?.isEnabled ?? true };
  }, [automation?.isEnabled, name, prompt, trigger]);
  useEffect(() => {
    focusRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    setName(automation?.name ?? "");
    setPrompt(automation?.prompt ?? "");
    setTrigger(automation?.trigger ?? null);
  }, [automation?.id, automation?.name, automation?.prompt, automation?.trigger]);
  useEffect(() => () => { focusRef.current = null; }, []);
  const update = (next: RoutineSpec | null) => {
    if (next == null || pending) return;
    if (create) {
      void controller.create(agentId, next).then((created) => { if (created != null) onCreated(created.id); }).catch(() => {});
    } else {
      void controller.update(agentId, automation.id, next).catch(() => {});
    }
  };
  const commitTrigger = (next: unknown) => {
    if (!isRoutineTrigger(next)) return;
    const nextTrigger = next;
    setTrigger(nextTrigger);
    const nextSpec: RoutineSpec | null = name.trim().length === 0 || prompt.trim().length === 0
      ? null
      : { name: name.trim(), prompt: prompt.trim(), trigger: nextTrigger, isEnabled: automation?.isEnabled ?? true };
    update(nextSpec);
  };
  const commitName = () => {
    if (automation != null && (name.trim().length === 0 || name.trim() === automation.name)) { setName(automation.name); return; }
    update(spec);
  };
  const commitPrompt = () => {
    if (automation != null && (prompt.trim().length === 0 || prompt.trim() === automation.prompt)) { setPrompt(automation.prompt); return; }
    update(spec);
  };
  const toggle = (isEnabled: boolean) => {
    if (automation == null || pending) return;
    void controller.setEnabled(agentId, automation.id, isEnabled).catch(() => {});
  };
  const remove = () => {
    if (automation == null || pending) { if (create) onDeleted(); return; }
    void controller.remove(agentId, automation.id).then(onDeleted).catch(() => {});
  };
  const run = () => {
    if (automation == null || pending || controller.runPending(agentId, automation.id)) return;
    void controller.runNow(agentId, automation.id).catch(() => {});
    focusRef.current?.scrollIntoView({ block: "nearest" });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onBack(); }
  };
  const running = automation?.runs[0]?.status === "running" || controller.runPending(agentId, automation?.id ?? "");

  return (
    <div className="sand-automation-detail sand-78zum5 sand-dt5ytf sand-1iyjqo2 sand-s83m0k sand-dl72j9" onKeyDown={onKeyDown} ref={focusRef} tabIndex={-1}>
      <div className="sand-1n2onr6 sand-1vjfegm sand-78zum5 sand-1qughib sand-167g77z">
        {automation == null ? null : <label><input checked={automation.isEnabled} disabled={pending} onChange={(event) => toggle(event.currentTarget.checked)} type="checkbox" />Active</label>}
        {automation == null ? null : <button disabled={pending} onClick={remove} type="button">Delete</button>}
        {automation == null ? null : <button disabled={pending || running} onClick={run} type="button">{running ? "Running…" : "Test run"}</button>}
      </div>
      <RoutineFields
        automation={automation}
        create={create}
        name={name}
        onNameChange={setName}
        onNameCommit={commitName}
        onPromptChange={setPrompt}
        onPromptCommit={commitPrompt}
        onTriggerChange={commitTrigger}
        pending={pending}
        runHistory={runHistory}
        prompt={prompt}
        saveError={saveError}
        trigger={trigger}
      />
    </div>
  );
}

function RoutineList({
  agentId,
  routines,
  controller,
  onOpen,
  onCreate
}: {
  agentId: string;
  routines: readonly RoutineAutomation[];
  controller: RoutinesController;
  onOpen(id: string): void;
  onCreate(): void;
}) {
  const ordered = [...routines].sort((left, right) => Number(right.isEnabled) - Number(left.isEnabled));
  if (ordered.length === 0) return <div className="sand-routine__empty"><p>Routines are recurring tasks this agent runs on a schedule.</p><button data-routine-row="new" disabled={controller.createPending(agentId)} onClick={onCreate} type="button">Create Routine</button></div>;
  return <ul aria-label="Routines" className="sand-routine__list">{ordered.map((routine) => <li key={routine.id}><button className="sand-routine__row" data-routine-row={routine.id} onClick={() => onOpen(routine.id)} type="button"><span aria-hidden="true" data-icon-name={routine.isEnabled ? routine.runs[0]?.status === "running" ? "loading" : "clock" : "pause-circle"} /><span>{routine.name}</span><small>{routine.isEnabled ? routine.triggerDescription : "Paused"}</small></button></li>)}</ul>;
}

export function RoutinesInfoPane({ agentId, automationId = null, controller, accountKey = null, timeZone, reconnectKey, onBack, onClose, disposeOnUnmount = false }: RoutinesInfoPaneProps) {
  const [, rerender] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(automationId);
  const [create, setCreate] = useState(false);
  const snapshot = controller.snapshot(agentId);
  const detectedTimeZone = timeZone?.detectedTimeZone ?? detectRoutineRunHistoryTimeZone().detectedTimeZone;
  const overrideTimeZone = timeZone?.overrideTimeZone ?? null;
  const initialScope = useMemo<RoutineRunHistoryScope | null>(() => selectedId == null ? null : { accountKey, agentId, automationId: selectedId }, [accountKey, agentId, selectedId]);
  const historyClock = useMemo(() => createRoutineRunHistoryClockOwner({
    initialTimeZone: { detectedTimeZone, overrideTimeZone },
    scheduler: browserRoutineRunHistoryScheduler
  }), [detectedTimeZone, overrideTimeZone]);
  const historyProvider = useMemo(() => createRoutineRunHistoryProvider({ controller, clock: historyClock, initialScope }), [controller, historyClock]);
  const historySnapshot = useSyncExternalStore(historyProvider.subscribe, historyProvider.snapshot, historyProvider.snapshot);
  useEffect(() => () => { historyProvider.dispose(); historyClock.dispose(); }, [historyClock, historyProvider]);
  useEffect(() => { historyClock.ingestTimeZone({ detectedTimeZone, overrideTimeZone }); }, [detectedTimeZone, historyClock, overrideTimeZone]);
  useEffect(() => {
    const scope = selectedId == null ? null : { accountKey, agentId, automationId: selectedId };
    historyProvider.setScope(scope);
    if (scope != null) void historyProvider.refresh().catch(() => {});
  }, [accountKey, agentId, historyProvider, selectedId]);
  useEffect(() => controller.subscribe(() => rerender((value) => value + 1)), [controller]);
  useEffect(() => {
    if (selectedId != null) void historyProvider.refreshOnReconnect().catch(() => {});
    else void controller.refresh(agentId).catch(() => {});
  }, [agentId, controller, historyProvider, reconnectKey, selectedId]);
  useEffect(() => () => { if (disposeOnUnmount) controller.dispose(); }, [controller, disposeOnUnmount]);
  useEffect(() => { setSelectedId(automationId); setCreate(false); }, [agentId, automationId]);
  const selected = selectedId == null ? null : snapshot.value.find((routine) => routine.id === selectedId) ?? null;
  const open = (id: string) => { setCreate(false); setSelectedId(id); };
  const closeEditor = () => { setCreate(false); setSelectedId(null); onBack?.(); };
  const body = selected != null || create ? <RoutineEditor agentId={agentId} automation={selected} controller={controller} runHistory={historySnapshot} onBack={closeEditor} onCreated={(id) => { setCreate(false); setSelectedId(id); }} onDeleted={closeEditor} /> : snapshot.status === "loading" ? <div aria-busy="true" aria-label="Routines" role="status" /> : snapshot.status === "failed" && snapshot.value.length === 0 ? <div aria-label="Routines" role="status" /> : <RoutineList agentId={agentId} controller={controller} onCreate={() => { setCreate(true); setSelectedId(null); }} onOpen={open} routines={snapshot.value} />;
  return <section aria-label="Routines" className="sand-automation-detail" onKeyDown={(event) => { if (event.key === "Escape" && (selected != null || create)) closeEditor(); }}><header><button aria-label="Back to Routines" onClick={closeEditor} type="button">{selected != null || create ? null : "Routines"}</button><button aria-label="Close details" onClick={onClose} type="button" /></header>{body}</section>;
}

export function mountRoutinesInfoPane(input: RoutinesInfoPaneMount): ReactNode {
  return <RoutinesInfoPane {...input} />;
}
