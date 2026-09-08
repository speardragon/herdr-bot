// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2672448 (Ugn)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2676317 (custom schedule field)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2699390 (15-minute schedule increments)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=3442824 (15-minute schedule increments)

import { useEffect, useRef, useState } from "react";
import { createRoutineTriggerDraftController, serializeRoutineTriggerDraft, type RoutineTriggerDraft } from "./trigger-draft-controller";
import { describeRoutineTrigger, routineTriggerToForms, type RoutineTriggerForm } from "./trigger-schema";
import { isValidSchedule, normalizeSchedule } from "./schedule";

const MINUTES_PER_DAY = 1440;
// The immutable A2n picker uses _Ue=15 and emits 96 quarter-hour choices.
export const ROUTINE_SCHEDULE_INTERVAL_MINUTES = 15;

export interface RoutineSchedulePickerOption {
  readonly label: string;
  readonly cron: (days: string) => string;
}

export function routineSchedulePickerOptions(): readonly RoutineSchedulePickerOption[] {
  return Array.from({ length: MINUTES_PER_DAY / ROUTINE_SCHEDULE_INTERVAL_MINUTES }, (_, index) => {
    const totalMinutes = index * ROUTINE_SCHEDULE_INTERVAL_MINUTES;
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return {
      label: `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`,
      cron: (days: string) => `${minute} ${hour} * * ${days}`
    };
  });
}

export interface RoutineCustomScheduleFieldProps {
  readonly schedule: string;
  readonly isCustomInvalid: boolean;
  onCustomScheduleChange(schedule: string): void;
  onCustomScheduleBlur(schedule: string): void;
}

/**
 * The dependency-closed custom branch of the shipped Ugn schedule editor.
 * It remains a controlled leaf; the surrounding recovered draft owner supplies
 * commit, stale-fencing, and disposal semantics.
 */
export function RoutineCustomScheduleField({
  schedule,
  isCustomInvalid,
  onCustomScheduleChange,
  onCustomScheduleBlur
}: RoutineCustomScheduleFieldProps) {
  return (
    <input
      aria-invalid={isCustomInvalid || undefined}
      aria-label="Schedule"
      onBlur={(event) => onCustomScheduleBlur(event.currentTarget.value)}
      onChange={(event) => onCustomScheduleChange(event.currentTarget.value)}
      type="text"
      value={schedule}
    />
  );
}

export function RoutineSchedulePicker({ days, onSelect }: { readonly days: string; onSelect(schedule: string): void }) {
  return (
    <select aria-label="Time" onChange={(event) => onSelect(event.currentTarget.value)} defaultValue="">
      <option disabled value=""></option>
      {routineSchedulePickerOptions().map((option) => <option key={option.label} value={option.cron(days)}>{option.label}</option>)}
    </select>
  );
}

export interface RoutineTriggerDraftEditorProps {
  readonly trigger: unknown | null;
  readonly pending: boolean;
  onCommit(trigger: unknown): void;
}

const EMPTY_DRAFT: RoutineTriggerDraft = { rows: [] };
const HOURLY_FORM: RoutineTriggerForm = { platform: "schedule", schedule: "0 * * * *" };

/** Non-root composition of the recovered P2n controller and Ugn schedule leaf. */
export function RoutineTriggerDraftEditor({ trigger, pending, onCommit }: RoutineTriggerDraftEditorProps) {
  const triggerKey = JSON.stringify(trigger ?? null);
  const initialDraft = routineTriggerToForms(trigger) == null ? EMPTY_DRAFT : { rows: routineTriggerToForms(trigger) ?? [] };
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const [controller] = useState(() => createRoutineTriggerDraftController(initialDraft, {
    onDraftChange: () => {},
    onDraftCommit: (draft) => {
      const next = serializeRoutineTriggerDraft(draft);
      if (next != null) commitRef.current(next);
    },
    onCommitOrRevertDraft: (draft) => {
      const next = serializeRoutineTriggerDraft(draft);
      if (next != null) commitRef.current(next);
    }
  }));
  const [, rerender] = useState(0);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => controller.subscribe(() => rerender((value) => value + 1)), [controller]);
  useEffect(() => {
    controller.reset(initialDraft);
  }, [controller, triggerKey]);
  const snapshot = controller.snapshot();
  useEffect(() => {
    const row = snapshot.focusReturnRow;
    if (row == null) return;
    rowRefs.current[row]?.focus({ preventScroll: true });
    controller.clearFocusReturnRow();
  }, [controller, snapshot.focusReturnRow]);
  const editingRow = snapshot.editingRow == null ? null : snapshot.draft.rows[snapshot.editingRow] ?? null;
  return (
    <div aria-busy={pending || snapshot.pending ? "true" : undefined} className="sand-trigger-card">
      {snapshot.draft.rows.length === 0 ? null : (
        <ul aria-label="Triggers">
          {snapshot.draft.rows.map((row, index) => {
            const sentence = describeRoutineTrigger(row);
            return (
              <li key={`${row.platform}-${index}`}>
                <button className="sand-trigger-card__row" disabled={pending || snapshot.pending} onClick={() => controller.openEditor(index)} ref={(element) => { rowRefs.current[index] = element; }} type="button">{sentence.lead} {sentence.rest}</button>
                <button aria-label={`Remove trigger: ${sentence.lead} ${sentence.rest}`} disabled={pending || snapshot.pending} onClick={() => { void controller.removeRow(index); }} type="button">Remove</button>
              </li>
            );
          })}
        </ul>
      )}
      {snapshot.editingRow == null ? (
        <div>
          <button aria-label={snapshot.draft.rows.length === 0 ? "Add trigger" : "Add another"} disabled={pending || snapshot.pending || snapshot.draft.rows.length >= 8} onClick={() => controller.openMenu()} type="button">{snapshot.draft.rows.length === 0 ? "Add trigger" : "Add another"}</button>
          {snapshot.menuOpen ? (
            <div aria-label="Trigger source" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); void controller.handleMenuEscape(); } }} role="menu">
              <button onClick={() => { void controller.addRowAndCommit(HOURLY_FORM).then(() => controller.setMenuOpen(false)); }} type="button">Every hour</button>
              <button onClick={() => { void controller.addRow({ platform: "schedule", schedule: "" }, true); }} type="button">Advanced…</button>
              <button onClick={() => { void controller.setMenuOpen(false); }} type="button">Cancel</button>
            </div>
          ) : null}
        </div>
      ) : (
        <div aria-label="Trigger fields" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); void controller.closeEditor("escape"); } }} role="dialog">
          {editingRow?.platform === "schedule" ? (
            <>
              <RoutineSchedulePicker days="*" onSelect={(schedule) => { void controller.blurCustomSchedule(snapshot.editingRow ?? 0, schedule); }} />
              <RoutineCustomScheduleField
                isCustomInvalid={snapshot.customInvalid}
                onCustomScheduleBlur={(schedule) => { void controller.blurCustomSchedule(snapshot.editingRow ?? 0, schedule); }}
                onCustomScheduleChange={(schedule) => { void controller.updateCustomSchedule(snapshot.editingRow ?? 0, schedule); }}
                schedule={editingRow.schedule}
              />
            </>
          ) : null}
          <button onClick={() => { void controller.closeEditor("cancel"); }} type="button">Cancel</button>
          <button disabled={pending || snapshot.pending} onClick={() => { if (snapshot.editingRow != null && editingRow?.platform === "schedule") void controller.blurCustomSchedule(snapshot.editingRow, editingRow.schedule); }} type="button">Save</button>
        </div>
      )}
    </div>
  );
}

export interface RoutineCustomScheduleBlurResult {
  readonly schedule: string;
  readonly isInvalid: boolean;
  readonly shouldCommit: boolean;
}

/** Mirrors Ugn's trim/validate/commit decision without invoking a bridge. */
export function resolveRoutineCustomScheduleBlur(value: string): RoutineCustomScheduleBlurResult {
  const schedule = normalizeSchedule(value);
  if (schedule.length === 0) return { schedule, isInvalid: false, shouldCommit: false };
  if (!isValidSchedule(schedule)) return { schedule, isInvalid: true, shouldCommit: false };
  return { schedule, isInvalid: false, shouldCommit: true };
}
