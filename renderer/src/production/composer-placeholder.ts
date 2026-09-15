// herdr-bot: composer placeholder after the Grok Bot reference -- "<chat name>에게 메시지 보내기" /
// "Message <chat name>". Pure (no runtime imports) so node:test can load it directly; the caller
// passes the active locale instead of this module reading the locale store.
export type PlaceholderLocale = "ko" | "en";

export function composerPlaceholder(chatName: string, locale: PlaceholderLocale): string {
  const name = chatName.trim();
  if (name.length === 0) return locale === "ko" ? "메시지 보내기" : "Send a message";
  return locale === "ko" ? `${name}에게 메시지 보내기` : `Message ${name}`;
}
