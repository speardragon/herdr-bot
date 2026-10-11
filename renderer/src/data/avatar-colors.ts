/**
 * The 11 fixed persona avatar colors. `AgentSummary.avatarColor`/`ChatSummary.avatarColor` is an
 * unvalidated string on the host -- the UI owns this vocabulary entirely, including the order shown in
 * a color-swatch picker: two rows of six/five, "black, brown, red, orange, yellow, green / teal, blue,
 * violet, magenta, gray".
 *
 * Pure module (no DOM/React) so it can be unit tested with plain `node --test`.
 */

export type PersonaColor =
  | "black"
  | "brown"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "cyan"
  | "blue"
  | "violet"
  | "magenta"
  | "gray";

/** Swatch-picker order, two rows of six/five. */
export const PERSONA_COLORS: readonly PersonaColor[] = [
  "black",
  "brown",
  "red",
  "orange",
  "yellow",
  "green",
  "cyan",
  "blue",
  "violet",
  "magenta",
  "gray",
];

export const DEFAULT_PERSONA_COLOR: PersonaColor = "gray";

function isPersonaColor(value: string): value is PersonaColor {
  return (PERSONA_COLORS as readonly string[]).includes(value);
}

/** Normalizes a host-supplied `avatarColor` (any string, or null/empty meaning "unset") to one of the
 * 11 known swatches, falling back to the default rather than rendering an un-themed avatar. */
export function resolvePersonaColor(avatarColor: string | null | undefined): PersonaColor {
  if (avatarColor == null || avatarColor.length === 0) return DEFAULT_PERSONA_COLOR;
  return isPersonaColor(avatarColor) ? avatarColor : DEFAULT_PERSONA_COLOR;
}

/** The CSS custom property carrying this color's accent hue (see styles/tokens.css `--hb-persona-*`). */
export function personaColorVar(color: PersonaColor): string {
  return `var(--hb-persona-${color})`;
}

/** Deterministically picks a color for a fresh bot/room avatar from an id, so a demo/dev list without
 * an explicit `avatarColor` still gets visually distinct avatars instead of always the default. */
export function personaColorForId(id: string): PersonaColor {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const index = hash % PERSONA_COLORS.length;
  return PERSONA_COLORS[index] ?? DEFAULT_PERSONA_COLOR;
}
