// herdr-bot: which persona colors (character.tsx's eleven color names) have a custom avatar image in
// place of the drawn cloud/blob mark, and which URL to use for each. Colors absent from the map fall
// through to the existing SVG persona mark unchanged -- this is deliberately a sparse, open-ended map
// rather than one entry per color, so adding another color's image later is one asset import plus one
// entry where the map is built (agent-avatar.tsx), with no other code path to touch.

export type PersonaAvatarImageMap = Readonly<Partial<Record<string, string>>>;

export function personaAvatarImageSrc(images: PersonaAvatarImageMap, color: string): string | null {
  return images[color] ?? null;
}
