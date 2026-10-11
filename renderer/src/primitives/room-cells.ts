import type { PersonaColor } from "../data/avatar-colors.ts";

export interface StackMember {
  readonly color: PersonaColor;
  readonly name: string;
}

const MAX_CELLS = 4;

export type RoomCell =
  | { readonly kind: "me"; readonly label: string }
  | { readonly kind: "member"; readonly member: StackMember }
  | { readonly kind: "overflow"; readonly count: number };

/** The user's own "Me" cell first (when asked for), then members, with the last cell turned into a
 * "+N" count when everyone doesn't fit in four cells. */
export function roomCells(members: readonly StackMember[], meLabel: string | undefined): readonly RoomCell[] {
  const lead: RoomCell[] = meLabel != null ? [{ kind: "me", label: meLabel }] : [];
  const room = MAX_CELLS - lead.length;
  if (members.length <= room) return [...lead, ...members.map((member): RoomCell => ({ kind: "member", member }))];
  const shown = members.slice(0, room - 1);
  return [...lead, ...shown.map((member): RoomCell => ({ kind: "member", member })), { kind: "overflow", count: members.length - shown.length }];
}

