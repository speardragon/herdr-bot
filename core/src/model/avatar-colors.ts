export const AVATAR_COLORS = ["brown", "red", "orange", "yellow", "green", "cyan", "blue", "violet", "magenta", "gray"] as const;

export function randomAvatarColor(random: () => number = Math.random): string {
  return AVATAR_COLORS[Math.floor(random() * AVATAR_COLORS.length)] ?? AVATAR_COLORS[0];
}
