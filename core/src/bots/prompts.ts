import { GROUP_MAX_MESSAGES_PER_TURN, formatGroupHistory, type GroupMember, type GroupMessage } from "../group/group-chat.ts";

export const ROOM_TAG_PREFIX = "[herdr-bot room ";
export const DM_TAG = "[herdr-bot DM]";

export interface RoomIdentity {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export function buildIdentityBrief(args: { readonly bot: GroupMember; readonly userName: string; readonly cliPath: string }): string {
  const { bot, userName, cliPath } = args;
  return [
    `[herdr-bot] You are "${bot.name}" (id: ${bot.id}), a bot managed by herdr-bot — a chat app where ${userName} and several bots talk in rooms.`,
    ...(bot.description.trim().length > 0 ? [`Your persona: ${bot.description.trim()}`] : []),
    "",
    "How rooms work:",
    `- Messages for you arrive in this terminal as prompts tagged ${ROOM_TAG_PREFIX}"<room>" ...] or ${DM_TAG}.`,
    "- The ONLY way to say something people can see is this shell command (max 2 per turn):",
    `    ${cliPath} say <room-id> "<your message>"`,
    `- If you have nothing worth adding, run: ${cliPath} pass <room-id>`,
    "- Whatever you print in this terminal is NOT visible in the chat. Only `say` reaches the room.",
    `- Read recent room history any time: ${cliPath} read <room-id>`,
    "- You have your full tools here. Do real work when asked (edit files, run commands, research), then report the result with `say`.",
    "- Keep each message short and conversational; reply in the language the room is using.",
    "- \"@<id>\" in a message addresses that bot. Mention others with @<id> when you need them; do not ping-pong acknowledgements.",
    "",
    "Reply \"ok\" in this terminal now. There is nothing to say to a room yet.",
  ].join("\n");
}

function crossChatInstructions(cliPath: string): string[] {
  return [
    "To contact another bot in that bot's DM:",
    `  ${cliPath} message <bot-id> "<message>"`,
    "To post to another room you belong to:",
    `  ${cliPath} message <room-id> "<message>"`,
    "Use say only for the chat whose turn is currently open. Use message only for a different DM or room.",
    "Send cross-chat messages only when requested or useful to the task. Do not send acknowledgement-only messages back and forth.",
    "When a user asks you to contact another bot, call message first. Only after it succeeds, say in your current chat that you sent the request and will report back when the answer arrives. End this turn; do not claim an answer yet.",
    "When another bot asks you to work, do the work, then send the result back to the requesting bot's id with message. A say in your own DM does not reach the requester.",
    "When you receive a result from a bot you contacted, summarize the received result to the user with say. Do not send the result back to that bot again.",
  ];
}

function roomTag(room: RoomIdentity, peers: readonly GroupMember[]): string {
  const withPeers = peers.length > 0 ? ` - with ${peers.map((peer) => peer.name).join(", ")}` : "";
  return `${ROOM_TAG_PREFIX}"${room.name}"${withPeers}]`;
}

function turnInstructions(chatId: string, member: GroupMember, cliPath: string): string[] {
  return [
    "",
    `It's your turn, ${member.name}. Say something only if it adds value (max ${GROUP_MAX_MESSAGES_PER_TURN} per turn):`,
    `  ${cliPath} say ${chatId} "<message>"`,
    `Or pass: ${cliPath} pass ${chatId}`,
    "Do the work first if the request needs it, then say the result. Nothing printed here is visible to the room.",
  ];
}

export function buildRoomTurnPrompt(args: {
  readonly room: RoomIdentity;
  readonly member: GroupMember;
  readonly peers: readonly GroupMember[];
  readonly newMessages: readonly GroupMessage[];
  readonly cliPath: string;
}): string {
  const { room, member, peers, newMessages, cliPath } = args;
  return [
    roomTag(room, peers),
    ...crossChatInstructions(cliPath),
    "Use say for this room.",
    ...(room.description.trim().length > 0 ? [`Room goal: ${room.description.trim()}`] : []),
    newMessages.length === 0 ? "No new messages in the room since your last turn." : `New messages in the room (oldest first):\n${formatGroupHistory(newMessages, member.id)}`,
    ...turnInstructions(room.id, member, cliPath),
  ].join("\n");
}

export function buildDmTurnPrompt(args: {
  readonly bot: GroupMember;
  readonly chatId: string;
  readonly userName: string;
  readonly newMessages: readonly GroupMessage[];
  readonly cliPath: string;
}): string {
  const { bot, chatId, userName, newMessages, cliPath } = args;
  return [
    `${DM_TAG} Direct chat between ${userName} and you (${bot.name}).`,
    ...crossChatInstructions(cliPath),
    "Use say only for this DM turn.",
    newMessages.length === 0 ? "No new messages." : `New messages (oldest first):\n${formatGroupHistory(newMessages, bot.id)}`,
    ...turnInstructions(chatId, bot, cliPath),
  ].join("\n");
}
