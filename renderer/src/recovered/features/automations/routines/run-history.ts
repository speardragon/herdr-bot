// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2647013 (pgn relative timestamp)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2708451 (M2n capitalization)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2708511 (J2n status mapping)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2718133 (Run history / No runs yet branch)

import type { RoutineRun } from "./controller";

export interface RoutineRunPresentation {
  readonly id: string;
  readonly title?: string;
  readonly timestampLabel: string;
  readonly status: RoutineRun["status"];
  readonly ariaLabel: "Running" | "Succeeded" | "Failed";
  readonly iconName: "loading" | "check" | "close";
  readonly statusRole?: "status";
}

export interface RoutineRunHistoryPresentation {
  readonly empty: boolean;
  readonly rows: readonly RoutineRunPresentation[];
}

interface ZonedParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly weekday: number;
  readonly hour: number;
  readonly minute: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function zonedParts(timestamp: number, timeZone?: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    ...(timeZone == null ? {} : { timeZone }),
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const weekday = WEEKDAYS.indexOf(parts.weekday as typeof WEEKDAYS[number]);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: weekday < 0 ? new Date(timestamp).getDay() : weekday,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute)
  };
}

function dateKey(timestamp: number, timeZone?: string): number {
  const parts = zonedParts(timestamp, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function clock(parts: ZonedParts): string {
  const hour = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
  return `${hour}:${String(parts.minute).padStart(2, "0")} ${parts.hour < 12 ? "AM" : "PM"}`;
}

/** Mirrors the immutable pgn + M2n relative timestamp branch. */
export function formatRoutineRunTimestamp(startedAt: number, now: number, timeZone?: string): string {
  const difference = startedAt - now;
  let result: string;
  if (difference > 0 && difference < 60 * 60 * 1000) result = `in ${Math.ceil(difference / (60 * 1000))} min`;
  else if (difference <= 0 && -difference < 60 * 1000) result = "just now";
  else if (difference <= 0 && -difference < 60 * 60 * 1000) result = `${Math.floor(-difference / (60 * 1000))} min ago`;
  else {
    const current = zonedParts(now, timeZone);
    const started = zonedParts(startedAt, timeZone);
    const dayDifference = Math.round((dateKey(startedAt, timeZone) - dateKey(now, timeZone)) / (24 * 60 * 60 * 1000));
    if (dayDifference === 0) result = `today at ${clock(started)}`;
    else if (dayDifference === 1) result = `tomorrow at ${clock(started)}`;
    else if (dayDifference === -1) result = `yesterday at ${clock(started)}`;
    else if (dayDifference > 1 && dayDifference < 7) result = `${WEEKDAYS[started.weekday]} at ${clock(started)}`;
    else if (dayDifference < -1 && dayDifference > -7) result = `last ${WEEKDAYS[started.weekday]} at ${clock(started)}`;
    else {
      const date = `${MONTHS[started.month - 1]} ${started.day}`;
      result = started.year === current.year ? `${date} at ${clock(started)}` : `${date}, ${started.year} at ${clock(started)}`;
    }
  }
  return result.charAt(0).toUpperCase() + result.slice(1);
}

export function presentRoutineRun(run: RoutineRun, now: number, timeZone?: string): RoutineRunPresentation {
  switch (run.status) {
    case "running": return { id: run.id, ...(run.detail ?? run.event) == null ? {} : { title: run.detail ?? run.event ?? undefined }, timestampLabel: formatRoutineRunTimestamp(run.startedAt, now, timeZone), status: run.status, ariaLabel: "Running", iconName: "loading", statusRole: "status" };
    case "ok": return { id: run.id, ...(run.detail ?? run.event) == null ? {} : { title: run.detail ?? run.event ?? undefined }, timestampLabel: formatRoutineRunTimestamp(run.startedAt, now, timeZone), status: run.status, ariaLabel: "Succeeded", iconName: "check" };
    case "error": return { id: run.id, ...(run.detail ?? run.event) == null ? {} : { title: run.detail ?? run.event ?? undefined }, timestampLabel: formatRoutineRunTimestamp(run.startedAt, now, timeZone), status: run.status, ariaLabel: "Failed", iconName: "close" };
  }
}

/** Pure branch for the immutable `runs.length > 0 ? <ul> : No runs yet` view. */
export function presentRoutineRunHistory(runs: readonly RoutineRun[], now: number, timeZone?: string): RoutineRunHistoryPresentation {
  return runs.length === 0 ? { empty: true, rows: [] } : { empty: false, rows: runs.map((run) => presentRoutineRun(run, now, timeZone)) };
}

