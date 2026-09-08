export type InstructionBehavior = "allow" | "ask";

export interface AutoReviewInstructions {
  allowInstructions: string[];
  blockInstructions: string[];
}

export interface InstructionRow {
  behavior: InstructionBehavior;
  text: string;
  listIndex: number;
}

export const MAX_INSTRUCTIONS_PER_BEHAVIOR = 20;

export function parseCursorAuthId(authId: string | null | undefined): { subject: string } | null {
  if (authId == null) return null;
  const separator = authId.indexOf("|");
  return separator <= 0 || separator >= authId.length - 1 ? null : { subject: authId.slice(separator + 1) };
}

export function instructionRows(instructions: AutoReviewInstructions): InstructionRow[] {
  return [
    ...instructions.allowInstructions.map((text, listIndex) => ({ behavior: "allow" as const, text, listIndex })),
    ...instructions.blockInstructions.map((text, listIndex) => ({ behavior: "ask" as const, text, listIndex }))
  ];
}

export function removeInstruction(instructions: AutoReviewInstructions, row: InstructionRow): AutoReviewInstructions {
  const key = row.behavior === "allow" ? "allowInstructions" : "blockInstructions";
  return { ...instructions, [key]: instructions[key].filter((_text, index) => index !== row.listIndex) };
}

export function reconcileInstructionRow(instructions: AutoReviewInstructions, row: InstructionRow): InstructionRow | null {
  const list = row.behavior === "allow" ? instructions.allowInstructions : instructions.blockInstructions;
  const listIndex = list.indexOf(row.text);
  return listIndex === -1 ? null : listIndex === row.listIndex ? row : { ...row, listIndex };
}

export function saveInstruction(
  instructions: AutoReviewInstructions,
  text: string,
  behavior: InstructionBehavior,
  editing: InstructionRow | null
): AutoReviewInstructions | null {
  const key = behavior === "allow" ? "allowInstructions" : "blockInstructions";
  const list = instructions[key];
  const editingSameList = editing?.behavior === behavior;
  if (list.some((item, index) => item === text && !(editingSameList && index === editing.listIndex))) return null;
  if (editing == null) return list.length >= MAX_INSTRUCTIONS_PER_BEHAVIOR ? null : { ...instructions, [key]: [...list, text] };
  if (editingSameList) {
    const next = [...list];
    next[editing.listIndex] = text;
    return { ...instructions, [key]: next };
  }
  if (list.length >= MAX_INSTRUCTIONS_PER_BEHAVIOR) return null;
  const withoutOld = removeInstruction(instructions, editing);
  return { ...withoutOld, [key]: [...withoutOld[key], text] };
}
