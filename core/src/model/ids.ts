import { randomBytes } from "node:crypto";

export const BOT_ID_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
export const ROOM_ID_PREFIX = "room-";

export function isValidBotId(value: string): boolean {
  return BOT_ID_PATTERN.test(value) && !value.startsWith(ROOM_ID_PREFIX);
}

export function slugify(text: string, maxLength = 24): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, maxLength).replace(/-+$/g, "");
}

export function suggestBotId(name: string): string {
  const slug = slugify(name, 32);
  const candidate = /^[a-z]/.test(slug) ? slug : `bot-${slug}`.slice(0, 32).replace(/-+$/g, "");
  return isValidBotId(candidate) ? candidate : "bot";
}

export function randomSuffix(): string {
  return randomBytes(2).toString("hex");
}

export function makeRoomId(name: string, suffix: string = randomSuffix()): string {
  const slug = slugify(name);
  return `${ROOM_ID_PREFIX}${slug.length > 0 ? slug : "chat"}-${suffix}`;
}

export function isRoomId(value: string): boolean {
  return value.startsWith(ROOM_ID_PREFIX);
}
