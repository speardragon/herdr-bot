import type { RoomMessage } from "./types.ts";

/** Attributes one transcript line unambiguously to its speaker: a human line by name (or a generic
 * fallback when no name is known), a member line by display name plus its id, flagged when the
 * speaker is the member this line is being rendered for. */
export function formatRoomLine(message: RoomMessage, selfId: string): string {
  if (message.speaker.kind === "user") {
    const label = message.speaker.name != null && message.speaker.name.trim().length > 0 ? message.speaker.name : "User";
    return `${label} (user): ${message.content}`;
  }
  const isSelf = message.speaker.id === selfId;
  return `${message.speaker.name} (bot id: ${message.speaker.id})${isSelf ? " (you)" : ""}: ${message.content}`;
}

/** Every line, oldest first. */
export function formatRoomHistory(messages: readonly RoomMessage[], selfId: string): string {
  return messages.map((message) => formatRoomLine(message, selfId)).join("\n");
}
