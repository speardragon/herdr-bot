import type { OnboardingStep } from "./model";

// Immutable renderer anchors: scene byte 5,385,191; placements 5,386,161 and
// 5,386,992; generated spring transitions 5,388,089; renderer 5,390,561.
// The persona mark accepts the complete shipped state catalog. The onboarding
// scene uses only a subset, while conversation surfaces project activity into
// the same first-party catalog.
export type OnboardingCharacterState =
  | "sleeping" | "waking" | "idle" | "listening" | "thinking" | "searching" | "working"
  | "excited" | "surprised" | "suspicious" | "angry" | "drowsy" | "happy" | "curious"
  | "confused" | "bored" | "proud" | "shy" | "sad" | "laughing" | "scared" | "playful"
  | "celebrate" | "orbit" | "radar" | "progress" | "spawning" | "humming" | "loading"
  | "dictating" | "writing" | "sending" | "receiving" | "uploading" | "notifying"
  | "alerting" | "dragging" | "bouncing" | "powering-down";
export type SceneCharacterId = "hero" | "invoice-chaser" | "weekly-standup" | "sales-forecast";
export interface AvatarTarget { x: number; y: number }
export interface SceneInput {
  step: OnboardingStep;
  meetBeat: number;
  demoBeat: number;
  demoCursor: AvatarTarget;
  jobsBeat: number;
  avatarTarget: AvatarTarget | null;
  isAvatarLanded: boolean;
  createColor: string;
  createShape: string;
}
export interface CharacterPlacement {
  id: SceneCharacterId; color: string; shape: string; x: number; y: number; scale: number; opacity: number;
  state: OnboardingCharacterState; transition: keyof typeof CHARACTER_TRANSITIONS; isGazing: boolean;
  bob: { amplitudePx: number; periodMs: number; delayMs: number } | null; surfaceTheme?: "light";
}

export const SCENE_CHARACTER_IDS: readonly SceneCharacterId[] = ["hero", "invoice-chaser", "weekly-standup", "sales-forecast"];
const JOB_POSITIONS = { "invoice-chaser": { x: 0, y: -112 }, "weekly-standup": { x: -132, y: 27 }, "sales-forecast": { x: 138, y: 7 } } as const;
const TOOL_POSITIONS = { "invoice-chaser": { x: -172, y: -328, scale: .4 }, "sales-forecast": { x: 246, y: -275, scale: .5 }, "weekly-standup": { x: -278, y: -255, scale: .45 } } as const;
const BOBS = { "invoice-chaser": { amplitudePx: 3, periodMs: 5200, delayMs: -1200 }, "weekly-standup": { amplitudePx: 5, periodMs: 7300, delayMs: -4700 }, "sales-forecast": { amplitudePx: 4, periodMs: 6400, delayMs: -2600 } } as const;
const COLORS = { "invoice-chaser": "red", "weekly-standup": "cyan", "sales-forecast": "blue" } as const;
const HIDDEN = { x: 0, y: -20, scale: .3, opacity: 0 } as const;

function springDuration(config: { mass: number; stiffness: number; damping: number }): number {
  return Math.round((-Math.log(1e-3) / (config.damping / (2 * config.mass))) * 1000);
}
function springValue(config: { mass: number; stiffness: number; damping: number }, time: number): number {
  const frequency = Math.sqrt(config.stiffness / config.mass), ratio = config.damping / (2 * Math.sqrt(config.stiffness * config.mass));
  if (ratio < 1) { const damped = frequency * Math.sqrt(1 - ratio * ratio); return 1 - Math.exp(-ratio * frequency * time) * (Math.cos(damped * time) + ratio * frequency / damped * Math.sin(damped * time)); }
  return 1 - Math.exp(-frequency * time) * (1 + frequency * time);
}
function springEasing(config: { mass: number; stiffness: number; damping: number }): string {
  const seconds = springDuration(config) / 1000, samples: string[] = [];
  for (let index = 0; index <= 48; index += 1) { const progress = index / 48; samples.push(`${Number(springValue(config, progress * seconds).toFixed(4))} ${Number((progress * 100).toFixed(2))}%`); }
  return `linear(${samples.join(", ")})`;
}
const STANDARD = { mass: 1, stiffness: 175, damping: 26 }, SLOW = { mass: 1, stiffness: 100, damping: 20 }, BOUNCE = { mass: 1, stiffness: 175, damping: 18.5 };
export const CHARACTER_TRANSITIONS = {
  standard: { duration: springDuration(STANDARD), easing: springEasing(STANDARD) },
  slow: { duration: springDuration(SLOW), easing: springEasing(SLOW) },
  bounce: { duration: springDuration(BOUNCE), easing: springEasing(BOUNCE) },
  exit: { duration: 300, easing: "cubic-bezier(0.4, 0, 1, 1)" },
  none: { duration: 0, easing: "linear" },
} as const;

function hero(input: SceneInput): CharacterPlacement {
  const base = { id: "hero" as const, color: "black", shape: "blob", isGazing: false, bob: null };
  if (input.step === "landing") return { ...base, ...HIDDEN, y: -75, state: "idle", transition: "none" };
  if (input.step === "meet") return input.meetBeat < 0
    ? { ...base, ...HIDDEN, y: -75, state: "waking", transition: "none" }
    : { ...base, x: 0, y: -75, scale: .8, opacity: 1, state: input.meetBeat === 0 ? "idle" : "listening", transition: "bounce", isGazing: true };
  if (input.step === "computer-demo") return { ...base, x: input.demoCursor.x + 32.89, y: input.demoCursor.y + 11.23, scale: .55, opacity: 1, state: input.demoBeat < 0 ? "thinking" : "working", transition: "slow", surfaceTheme: "light" };
  if (input.step === "jobs") return input.jobsBeat < 1
    ? { ...base, x: 0, y: -20, scale: 1, opacity: 1, state: input.jobsBeat === 0 ? "excited" : "happy", transition: "standard", isGazing: true }
    : { ...base, x: 0, y: -20, scale: 1.2, opacity: 0, state: "celebrate", transition: "exit" };
  return { ...base, ...HIDDEN, state: "idle", transition: "none" };
}
function teammate(input: SceneInput, id: Exclude<SceneCharacterId, "hero">): CharacterPlacement {
  const base = { id, color: COLORS[id], shape: "blob", isGazing: false, bob: null }, job = JOB_POSITIONS[id], tool = TOOL_POSITIONS[id];
  if (input.step === "jobs") return input.jobsBeat < 1
    ? { ...base, ...HIDDEN, state: "sleeping", transition: "none" }
    : { ...base, ...job, scale: 1, opacity: 1, state: input.jobsBeat === 1 ? "excited" : "happy", transition: "bounce", isGazing: true };
  if (input.step === "tools") return { ...base, ...tool, opacity: 1, state: "idle", transition: "standard", bob: BOBS[id] };
  if (input.step === "create") {
    if (id !== "sales-forecast") return { ...base, x: tool.x, y: tool.y - 40, scale: tool.scale * .8, opacity: 0, state: "sleeping", transition: "exit" };
    const selected = { ...base, color: input.createColor, shape: input.createShape };
    if (input.isAvatarLanded) return { ...selected, x: input.avatarTarget?.x ?? tool.x, y: input.avatarTarget?.y ?? tool.y, scale: .8, opacity: 0, state: "happy", transition: "none" };
    if (input.avatarTarget == null) return { ...selected, ...tool, opacity: 1, state: "happy", transition: "standard" };
    return { ...selected, ...input.avatarTarget, scale: .8, opacity: 1, state: "happy", transition: "standard" };
  }
  return { ...base, ...HIDDEN, state: "sleeping", transition: "none" };
}
export function scenePlacements(input: SceneInput): CharacterPlacement[] {
  return SCENE_CHARACTER_IDS.map((id) => id === "hero" ? hero(input) : teammate(input, id));
}
export function avatarTargetFromRect(rect: Pick<DOMRect, "left" | "top" | "width" | "height">, viewport: { width: number; height: number }): AvatarTarget {
  return { x: rect.left + rect.width / 2 - viewport.width / 2, y: rect.top + rect.height / 2 - viewport.height / 2 };
}
export function isAvatarLandingTransition(propertyName: string): boolean { return propertyName === "transform"; }
