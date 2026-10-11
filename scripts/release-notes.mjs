#!/usr/bin/env node
// Prints the GitHub release notes for one version: that version's CHANGELOG.md section followed by
// install instructions for the DMGs. Usage: node scripts/release-notes.mjs 1.2.3
import { readFileSync } from "node:fs";

const version = process.argv[2];
if (version == null || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error("usage: node scripts/release-notes.mjs <version>  (e.g. 1.2.3)");
  process.exit(2);
}

const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const heading = new RegExp(`^## \\[${version.replace(/[.]/g, "\\.")}\\][^\\n]*\\n`, "m");
const start = changelog.search(heading);
if (start < 0) {
  console.error(`CHANGELOG.md has no "## [${version}]" section`);
  process.exit(1);
}
const afterHeading = changelog.indexOf("\n", start) + 1;
const next = changelog.slice(afterHeading).search(/^## \[|^\[[^\]]+\]: /m);
const section = (next < 0 ? changelog.slice(afterHeading) : changelog.slice(afterHeading, afterHeading + next)).trim();

process.stdout.write(`${section}

## Install

| Mac | Download |
|---|---|
| Apple silicon (M1 and later) | \`herdr-bot-${version}-arm64.dmg\` |
| Intel | \`herdr-bot-${version}-x64.dmg\` |

Open the DMG and drag **herdr-bot** into Applications. You also need [herdr](https://herdr.dev) 0.9.0 or newer
(\`brew install herdr\`) and the agent CLIs you want as bots, already signed in.

The app is not code-signed yet, so macOS blocks the first launch. Either right-click the app, choose **Open**
and confirm, or run:

\`\`\`bash
xattr -dr com.apple.quarantine /Applications/herdr-bot.app
\`\`\`

\`SHA256SUMS.txt\` lists the checksums of both DMGs.
`);
