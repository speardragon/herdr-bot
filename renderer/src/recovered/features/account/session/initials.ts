// herdr-bot addition (not in the upstream bundle): the user avatar shows up to two characters
// taken from the display name -- the first character of each of the first two words
// ("창룡 강" -> "창강", "Donald Duck" -> "DD"), or the first two characters of a lone word
// ("ray" -> "RA"). Latin letters are upper-cased; Hangul and other scripts are unaffected.
export function accountInitials(name: string): string {
  const words = name.trim().split(/\s+/u).filter((word) => word.length > 0);
  if (words.length === 0) return "";
  const chars = words.length >= 2
    ? [Array.from(words[0]!)[0]!, Array.from(words[1]!)[0]!]
    : Array.from(words[0]!).slice(0, 2);
  return chars.join("").toLocaleUpperCase();
}
