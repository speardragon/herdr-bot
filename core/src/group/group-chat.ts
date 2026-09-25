export interface GroupMember {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** The optional label under the bot's name in Agent Settings (e.g. "리서치, 마케팅"); absent for rooms' view of peers. */
  readonly title?: string;
}

export type GroupSpeaker =
  | { readonly kind: "user"; readonly name?: string }
  | { readonly kind: "member"; readonly id: string; readonly name: string };

export interface GroupMessage {
  readonly speaker: GroupSpeaker;
  readonly content: string;
}

export const GROUP_MAX_MEMBER_TURNS = 10;
export const GROUP_MAX_ROUNDS = 3;
export const GROUP_PROMPT_HISTORY_LIMIT = 24;
export const GROUP_MAX_MESSAGES_PER_TURN = 2;
export const GROUP_MAX_MEMBERS = 6;

export function orderRoundSpeakers<T>(memberIds: readonly T[], round: number): T[] {
  if (memberIds.length === 0) return [];
  const offset = ((round % memberIds.length) + memberIds.length) % memberIds.length;
  return [...memberIds.slice(offset), ...memberIds.slice(0, offset)];
}

export function isSameMemberSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

export function memberMentionHandles(name: string, id?: string): string[] {
  const lower = name.trim().toLowerCase();
  const handles = new Set<string>();
  if (lower.length > 0) {
    handles.add(lower);
    handles.add(lower.replace(/\s+/g, ""));
    const first = lower.split(/\s+/)[0];
    if (first) handles.add(first);
  }
  if (id != null && id.length > 0) handles.add(id.toLowerCase());
  return [...handles];
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[a-z0-9_-]/.test(char);
}

function hasMentionAt(lower: string, handle: string): boolean {
  const needle = `@${handle}`;
  for (let index = lower.indexOf(needle); index >= 0; index = lower.indexOf(needle, index + 1)) {
    if (!isWordChar(lower[index - 1]) && !isWordChar(lower[index + needle.length])) return true;
  }
  return false;
}

export function parseGroupMentions(text: string, members: readonly Pick<GroupMember, "id" | "name">[]): { isEveryone: boolean; memberIds: string[] } {
  const lower = text.toLowerCase();
  const memberIds: string[] = [];
  for (const member of members) {
    if (memberIds.includes(member.id)) continue;
    if (memberMentionHandles(member.name, member.id).some((handle) => hasMentionAt(lower, handle))) memberIds.push(member.id);
  }
  return { isEveryone: /(?:^|[^a-z0-9])@(everyone|all)\b/.test(lower), memberIds };
}

export function resolveResponders<T extends Pick<GroupMember, "id" | "name">>(members: readonly T[], history: readonly GroupMessage[]): T[] {
  let start = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]?.speaker.kind === "user") {
      start = index;
      break;
    }
  }
  let everyone = false;
  const mentioned = new Set<string>();
  for (const message of history.slice(start)) {
    const targets = parseGroupMentions(message.content, members);
    everyone ||= targets.isEveryone;
    for (const id of targets.memberIds) mentioned.add(id);
  }
  return everyone || mentioned.size === 0 ? [...members] : members.filter((member) => mentioned.has(member.id));
}

export function isPassContent(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.length === 0 || /^\(?\s*pass\s*\)?\.?$/i.test(trimmed);
}

export function formatGroupLine(message: GroupMessage, viewerId: string): string {
  if (message.speaker.kind === "user") return message.speaker.name ? `${message.speaker.name} (user): ${message.content}` : `User: ${message.content}`;
  return `${message.speaker.name} (bot id: ${message.speaker.id})${message.speaker.id === viewerId ? " (you)" : ""}: ${message.content}`;
}

export function formatGroupHistory(history: readonly GroupMessage[], viewerId: string, limit: number = GROUP_PROMPT_HISTORY_LIMIT): string {
  const recent = history.slice(-limit);
  return recent.length === 0 ? "(no messages yet)" : recent.map((message) => formatGroupLine(message, viewerId)).join("\n");
}

export function messagesSinceMemberLastSpoke(history: readonly GroupMessage[], memberId: string): GroupMessage[] {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const speaker = history[index]?.speaker;
    if (speaker?.kind === "member" && speaker.id === memberId) return history.slice(index + 1);
  }
  return [...history];
}
