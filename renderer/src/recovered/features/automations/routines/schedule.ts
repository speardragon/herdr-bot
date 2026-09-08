// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2647683 (normalize)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2649969 (validation)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2655329 (schedule serializer)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2657913 (schedule parser)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=3366489 (Mac/Windows normalize carrier)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=3369515 (Mac/Windows validation carrier)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=3376704 (Mac/Windows serializer carrier)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=3380226 (Mac/Windows parser carrier)

export type ScheduleUnit = "minutes" | "hours" | "days";

export type ScheduleTime =
  | { readonly kind: "at-times"; readonly minute: number; readonly hours: readonly number[] }
  | { readonly kind: "interval"; readonly unit: "minutes" | "hours"; readonly amount: number; readonly fromHour: number; readonly toHour: number };

export type ScheduleDays =
  | { readonly kind: "every-day" }
  | { readonly kind: "days-of-week"; readonly daysOfWeek: readonly number[] }
  | { readonly kind: "days-of-month"; readonly daysOfMonth: readonly number[] };

export type ScheduleSpec =
  | { readonly mode: "hourly"; readonly minute: number }
  | { readonly mode: "daily" | "weekdays"; readonly time: { readonly hour: number; readonly minute: number } }
  | { readonly mode: "weekly"; readonly dayOfWeek: number; readonly time: { readonly hour: number; readonly minute: number } }
  | { readonly mode: "monthly"; readonly dayOfMonth: number; readonly time: { readonly hour: number; readonly minute: number } }
  | { readonly mode: "interval"; readonly amount: number; readonly unit: ScheduleUnit }
  | { readonly mode: "advanced"; readonly months: readonly number[] | null; readonly days: ScheduleDays; readonly time: ScheduleTime };

const EVERY_PATTERN = /^@every\s+(\d+)\s*(s|m|h|d)$/i;
const CRON_TIME_ZONE = /^(?:CRON_TZ|TZ)=(\S+)\s+/;
const CRON_ALIASES: Readonly<Record<string, string>> = {
  "@hourly": "0 * * * *",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@weekly": "0 0 * * 0",
  "@monthly": "0 0 1 * *",
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *"
};
const UNIT_SUFFIX: Readonly<Record<ScheduleUnit, string>> = { minutes: "m", hours: "h", days: "d" };
const SUFFIX_UNIT: Readonly<Record<string, ScheduleUnit>> = { m: "minutes", h: "hours", d: "days" };
const WEEKDAYS = [1, 2, 3, 4, 5] as const;

interface ParsedCron {
  readonly minute: Set<number>;
  readonly hour: Set<number>;
  readonly dayOfMonth: Set<number>;
  readonly month: Set<number>;
  readonly dayOfWeek: Set<number>;
  readonly isDayOfMonthRestricted: boolean;
  readonly isDayOfWeekRestricted: boolean;
  readonly timeZone?: string;
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function splitTimeZone(value: string): { readonly schedule: string; readonly timeZone?: string } {
  const normalized = normalize(value);
  const match = CRON_TIME_ZONE.exec(normalized);
  return match == null
    ? { schedule: normalized }
    : { schedule: normalized.slice(match[0].length), timeZone: match[1] };
}

function alias(value: string): string {
  return CRON_ALIASES[value.toLowerCase()] ?? value;
}

function expandField(value: string, minimum: number, maximum: number): Set<number> | null {
  const result = new Set<number>();
  for (const segment of value.split(",")) {
    const parts = segment.split("/");
    if (parts.length > 2) return null;
    const base = parts[0] ?? "";
    const step = parts.length === 2 ? Number(parts[1]) : 1;
    if (!Number.isInteger(step) || step <= 0) return null;
    let start: number;
    let end: number;
    if (base === "*" || base === "") {
      start = minimum;
      end = maximum;
    } else if (base.includes("-")) {
      const [first, last] = base.split("-");
      start = Number(first);
      end = Number(last);
    } else {
      start = Number(base);
      end = parts.length === 2 ? maximum : start;
    }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < minimum || end > maximum || start > end) return null;
    for (let item = start; item <= end; item += step) result.add(item);
  }
  return result.size > 0 ? result : null;
}

function parseCron(value: string): ParsedCron | null {
  const { schedule, timeZone } = splitTimeZone(value);
  const fields = alias(schedule).split(" ");
  if (fields.length !== 5) return null;
  const [minute = "", hour = "", dayOfMonth = "", month = "", dayOfWeek = ""] = fields;
  const parsedMinute = expandField(minute, 0, 59);
  const parsedHour = expandField(hour, 0, 23);
  const parsedDayOfMonth = expandField(dayOfMonth, 1, 31);
  const parsedMonth = expandField(month, 1, 12);
  const parsedDayOfWeek = expandField(dayOfWeek, 0, 7);
  if (parsedMinute == null || parsedHour == null || parsedDayOfMonth == null || parsedMonth == null || parsedDayOfWeek == null) return null;
  return {
    minute: parsedMinute,
    hour: parsedHour,
    dayOfMonth: parsedDayOfMonth,
    month: parsedMonth,
    dayOfWeek: new Set([...parsedDayOfWeek].map((item) => item === 7 ? 0 : item)),
    isDayOfMonthRestricted: dayOfMonth !== "*",
    isDayOfWeekRestricted: dayOfWeek !== "*",
    ...(timeZone === undefined ? {} : { timeZone })
  };
}

function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value, hourCycle: "h23" });
    return true;
  } catch {
    return false;
  }
}

function sortedUnique(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function joinNumbers(values: readonly number[]): string {
  return sortedUnique(values).join(",");
}

function joinMonths(values: readonly number[] | null): string {
  return values == null || sortedUnique(values).length >= 12 ? "*" : joinNumbers(values);
}

function joinDays(days: ScheduleDays): { readonly dayOfMonth: string; readonly dayOfWeek: string } {
  switch (days.kind) {
    case "every-day": return { dayOfMonth: "*", dayOfWeek: "*" };
    case "days-of-week": return { dayOfMonth: "*", dayOfWeek: sortedUnique(days.daysOfWeek).length >= 7 ? "*" : joinNumbers(days.daysOfWeek) };
    case "days-of-month": return { dayOfMonth: sortedUnique(days.daysOfMonth).length >= 31 ? "*" : joinNumbers(days.daysOfMonth), dayOfWeek: "*" };
  }
}

function scheduleTimeFields(time: ScheduleTime): { readonly minute: string; readonly hour: string } {
  if (time.kind === "at-times") {
    const hours = sortedUnique(time.hours);
    return { minute: String(time.minute), hour: hours.length >= 24 ? "*" : joinNumbers(hours) };
  }
  const fullDay = time.fromHour <= 0 && time.toHour >= 23;
  const hour = fullDay ? "*" : `${time.fromHour}-${time.toHour}`;
  if (time.unit === "minutes") return { minute: time.amount === 1 ? "*" : `*/${time.amount}`, hour };
  return time.amount === 1
    ? { minute: "0", hour }
    : { minute: "0", hour: fullDay ? `*/${time.amount}` : `${hour}/${time.amount}` };
}

/** Serializes the exact schedule shape consumed by the shipped Ugn editor. */
export function serializeSchedule(schedule: ScheduleSpec): string {
  switch (schedule.mode) {
    case "hourly": return `${schedule.minute} * * * *`;
    case "daily": return `${schedule.time.minute} ${schedule.time.hour} * * *`;
    case "weekdays": return `${schedule.time.minute} ${schedule.time.hour} * * 1-5`;
    case "weekly": return `${schedule.time.minute} ${schedule.time.hour} * * ${schedule.dayOfWeek}`;
    case "monthly": return `${schedule.time.minute} ${schedule.time.hour} ${schedule.dayOfMonth} * *`;
    case "interval": return `@every ${schedule.amount}${UNIT_SUFFIX[schedule.unit]}`;
    case "advanced": {
      const time = scheduleTimeFields(schedule.time);
      const days = joinDays(schedule.days);
      return `${time.minute} ${time.hour} ${days.dayOfMonth} ${joinMonths(schedule.months)} ${days.dayOfWeek}`;
    }
  }
}

function sequenceStep(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const first = values[0];
  const second = values[1];
  if (first === undefined || second === undefined) return null;
  const step = second - first;
  if (step <= 0) return null;
  for (let index = 2; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    if (previous === undefined || current === undefined || current - previous !== step) return null;
  }
  return step;
}

function sameNumbers(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function inferTime(minutes: readonly number[], hours: readonly number[]): ScheduleTime | null {
  const firstMinute = minutes[0];
  const firstHour = hours[0];
  const lastHour = hours[hours.length - 1];
  if (firstMinute === undefined || firstHour === undefined || lastHour === undefined) return null;
  if (minutes.length === 1) {
    const hourStep = sequenceStep(hours);
    return firstMinute === 0 && hourStep != null && hourStep >= 2 && hours.length > 2
      ? firstHour === 0 && lastHour + hourStep > 23
        ? { kind: "interval", unit: "hours", amount: hourStep, fromHour: 0, toHour: 23 }
        : { kind: "interval", unit: "hours", amount: hourStep, fromHour: firstHour, toHour: lastHour }
      : { kind: "at-times", minute: firstMinute, hours: [...hours] };
  }
  const lastMinute = minutes[minutes.length - 1];
  const minuteStep = minutes.length === 60 ? 1 : sequenceStep(minutes);
  if (firstMinute !== 0 || lastMinute === undefined || minuteStep == null || lastMinute + minuteStep <= 59) return null;
  if (hours.length === 24) return { kind: "interval", unit: "minutes", amount: minuteStep, fromHour: 0, toHour: 23 };
  if (hours.length > 1 && sequenceStep(hours) !== 1) return null;
  return { kind: "interval", unit: "minutes", amount: minuteStep, fromHour: firstHour, toHour: lastHour };
}

function parseCronSchedule(cron: ParsedCron): ScheduleSpec | null {
  const minutes = sortedUnique([...cron.minute]);
  const hours = sortedUnique([...cron.hour]);
  const monthsAreAll = cron.month.size === 12;
  const monthRestricted = !monthsAreAll;
  const dayOfMonthRestricted = cron.isDayOfMonthRestricted && cron.dayOfMonth.size < 31;
  const dayOfWeekRestricted = cron.isDayOfWeekRestricted && cron.dayOfWeek.size < 7;
  if (dayOfMonthRestricted && dayOfWeekRestricted) return null;
  const restricted = monthRestricted || dayOfMonthRestricted || dayOfWeekRestricted;
  const firstMinute = minutes[0];
  let time: ScheduleTime;
  if (minutes.length === 1 && hours.length === 24 && firstMinute !== undefined) {
    if (!restricted) return { mode: "hourly", minute: firstMinute };
    if (firstMinute !== 0) return null;
    time = { kind: "interval", unit: "hours", amount: 1, fromHour: 0, toHour: 23 };
  } else {
    const inferred = inferTime(minutes, hours);
    if (inferred == null) return null;
    time = inferred;
  }
  const days: ScheduleDays = dayOfWeekRestricted
    ? { kind: "days-of-week", daysOfWeek: sortedUnique([...cron.dayOfWeek]) }
    : dayOfMonthRestricted
      ? { kind: "days-of-month", daysOfMonth: sortedUnique([...cron.dayOfMonth]) }
      : { kind: "every-day" };
  if (monthsAreAll && time.kind === "at-times" && time.hours.length === 1) {
    const hour = time.hours[0];
    if (hour !== undefined) {
      const clock = { hour, minute: time.minute };
      if (days.kind === "every-day") return { mode: "daily", time: clock };
      if (days.kind === "days-of-week") {
        if (sameNumbers(days.daysOfWeek, WEEKDAYS)) return { mode: "weekdays", time: clock };
        const day = days.daysOfWeek[0];
        if (days.daysOfWeek.length === 1 && day !== undefined) return { mode: "weekly", dayOfWeek: day, time: clock };
      }
      if (days.kind === "days-of-month") {
        const day = days.daysOfMonth[0];
        if (days.daysOfMonth.length === 1 && day !== undefined) return { mode: "monthly", dayOfMonth: day, time: clock };
      }
    }
  }
  return { mode: "advanced", months: monthsAreAll ? null : sortedUnique([...cron.month]), days, time };
}

/** Parses the structured schedule accepted by the shipped Ugn editor. Time-zone-prefixed cron remains custom. */
export function parseSchedule(value: string): ScheduleSpec | null {
  const normalized = normalize(value);
  const interval = EVERY_PATTERN.exec(normalized);
  if (interval != null) {
    const amount = Number(interval[1]);
    const unit = SUFFIX_UNIT[interval[2]?.toLowerCase() ?? ""];
    return Number.isInteger(amount) && amount > 0 && unit != null ? { mode: "interval", amount, unit } : null;
  }
  const cron = parseCron(normalized);
  return cron == null || cron.timeZone !== undefined ? null : parseCronSchedule(cron);
}

/** Validates both plain cron and the shipped `@every`/time-zone forms. */
export function isValidSchedule(value: string): boolean {
  const normalized = normalize(value);
  const interval = EVERY_PATTERN.exec(normalized);
  if (interval != null) return Number.isInteger(Number(interval[1])) && Number(interval[1]) > 0;
  const cron = parseCron(normalized);
  return cron != null && (cron.timeZone === undefined || validTimeZone(cron.timeZone));
}

export function normalizeSchedule(value: string): string {
  return normalize(value);
}
