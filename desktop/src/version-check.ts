// herdr-bot: no code-signing certificate, so there is no silent background install (Squirrel.Mac in
// particular refuses to run against an unsigned build). The "check for updates" button instead just
// compares the running version against the latest GitHub release tag and, if newer, lets the user
// open that release's page to download and install it themselves. This is the pure half of that
// check -- a dotted-numeric version compare, tolerant of a leading "v" and a "-beta.1"-style suffix
// (GitHub tag conventions), with no dependency on the network call that finds the candidate version.

function parseVersionParts(version: string): readonly number[] {
  const core = version.trim().replace(/^v/i, "").split(/[-+]/, 1)[0] ?? "";
  return core.split(".").map((part) => {
    const parsed = Number.parseInt(part, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
}

/** -1 if `a` < `b`, 0 if equal, 1 if `a` > `b`, comparing missing trailing parts as 0 (so "1.2" == "1.2.0"). */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const partsA = parseVersionParts(a);
  const partsB = parseVersionParts(b);
  const length = Math.max(partsA.length, partsB.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (partsA[index] ?? 0) - (partsB[index] ?? 0);
    if (diff > 0) return 1;
    if (diff < 0) return -1;
  }
  return 0;
}

export function isNewerVersion(current: string, candidate: string): boolean {
  return compareVersions(candidate, current) > 0;
}
