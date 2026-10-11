/**
 * In-memory demo dataset for the browser dev harness (`npm run renderer:dev` + `?demo`) -- the same 5
 * bots and 2 rooms as the Electron app's own demo fixture (`HERDR_BOT_HOME` seeded for a demo), so a
 * screenshot taken here and one taken from the real app look alike. See fake-app-api.ts for the
 * transport this feeds.
 */
import type { ChatSummary, PendingPrompt, TranscriptEntry } from "../data/types.ts";

const now = Date.now();
const minutesAgo = (minutes: number): number => now - minutes * 60_000;

export const DEMO_BOTS = [
  { id: "atlas", name: "Atlas", title: "Planning", description: "Breaks work into small, ordered steps and keeps the team on track.", color: "orange" },
  { id: "forge", name: "Forge", title: "Engineering", description: "Writes and fixes code across the stack. Prefers small, tested diffs.", color: "blue" },
  { id: "lens", name: "Lens", title: "Code review", description: "Reviews diffs for correctness, edge cases and security.", color: "violet" },
  { id: "scout", name: "Scout", title: "Research", description: "Reads docs and issues, and reports back with sources.", color: "green" },
  { id: "pixel", name: "Pixel", title: "Design QA", description: "Checks UI changes against the design system.", color: "magenta" },
] as const;

const FORGE_PROMPT: PendingPrompt = {
  kind: "permission",
  title: "Bash command",
  header: null,
  progress: null,
  question: "Do you want to proceed?",
  body: ["npm run db:migrate -- --env staging", "Apply the rate_limit_buckets migration to the staging database"],
  options: [
    { key: "A", label: "Yes", detail: null, selected: false, checked: null },
    { key: "B", label: "Yes, and don't ask again for: npm run db:migrate", detail: null, selected: false, checked: null },
    { key: "C", label: "No", detail: null, selected: false, checked: null },
  ],
  multiSelect: false,
  freeTextKey: null,
  signature: "demo-forge-migrate",
};

function botChat(id: string, overrides: Partial<ChatSummary> & { readonly lastMessagePreview: string; readonly lastActivityAt: number; readonly hasUnread?: boolean }): ChatSummary {
  const spec = DEMO_BOTS.find((bot) => bot.id === id)!;
  const blocked = id === "forge";
  const working = id === "lens";
  return {
    id,
    kind: "bot",
    name: spec.name,
    description: spec.description,
    title: spec.title,
    avatarShape: null,
    avatarColor: spec.color,
    createdAt: minutesAgo(2000),
    updatedAt: overrides.lastActivityAt,
    isRunning: working,
    currentActivity: working ? { verb: "working" } : null,
    lastMessageId: null,
    hasUnread: overrides.hasUnread ?? false,
    unreadCount: overrides.hasUnread ? 1 : 0,
    lastViewedAt: overrides.lastActivityAt,
    lastReadSeq: 0,
    lastIncomingSeq: 0,
    lastMessageAt: overrides.lastActivityAt,
    awaitingUserResponse: blocked ? { reason: "approval" } : null,
    notifyOnUpdatesEnabled: true,
    isHiddenFromSidebar: false,
    isGroup: false,
    memberIds: [],
    bot: {
      provider: "claude",
      status: blocked ? "blocked" : working ? "working" : "idle",
      paneId: `demo:${id}`,
      cwd: "/Users/ray/work/shop",
      adopted: false,
      permissionMode: "ask",
      model: "sonnet",
      reasoningEffort: "medium",
      onboarding: null,
      pendingPrompt: blocked ? FORGE_PROMPT : null,
    },
    ...overrides,
  };
}

function roomChat(id: string, name: string, description: string, memberIds: readonly string[], lastMessagePreview: string, lastActivityAt: number): ChatSummary {
  return {
    id,
    kind: "room",
    name,
    description,
    title: "",
    avatarShape: null,
    avatarColor: null,
    createdAt: minutesAgo(2000),
    updatedAt: lastActivityAt,
    isRunning: false,
    currentActivity: null,
    lastMessagePreview,
    lastMessageId: null,
    hasUnread: false,
    unreadCount: 0,
    lastViewedAt: lastActivityAt,
    lastActivityAt,
    lastReadSeq: 0,
    lastIncomingSeq: 0,
    lastMessageAt: lastActivityAt,
    awaitingUserResponse: null,
    notifyOnUpdatesEnabled: true,
    isHiddenFromSidebar: false,
    isGroup: true,
    memberIds,
    bot: null,
  };
}

export const DEMO_CHATS: readonly ChatSummary[] = [
  roomChat("room-checkout", "Checkout rate limits", "Stop 429 bursts on /checkout before the flash sale.", ["atlas", "forge", "lens"], "Ship it. @Lens one last pass on the load-test numbers?", minutesAgo(2)),
  botChat("forge", { lastMessagePreview: "Migration is ready. It needs your approval before it runs on staging.", lastActivityAt: minutesAgo(8) }),
  botChat("scout", { lastMessagePreview: "Forge confirmed: our Stripe client retries with exponential backoff.", lastActivityAt: minutesAgo(46), hasUnread: true }),
  botChat("lens", { lastMessagePreview: "Reviewed PR #482: two nits on naming, no blockers.", lastActivityAt: minutesAgo(140), hasUnread: true }),
  roomChat("room-release", "Release 2.4", "Everything that ships in 2.4.", ["atlas", "scout", "forge", "pixel"], "The receipt email matches the design system now.", minutesAgo(188)),
  botChat("atlas", { lastMessagePreview: "Rollout: 5% on Monday, 50% on Tuesday, 100% on Wednesday.", lastActivityAt: minutesAgo(318) }),
  botChat("pixel", { lastMessagePreview: "New icons are exported at 1x/2x/3x.", lastActivityAt: minutesAgo(600) }),
];

let seq = 0;
function entry(kind: string, timestampMs: number, rest: Record<string, unknown>): TranscriptEntry {
  seq += 1;
  return { id: `demo-e${seq}`, kind, seq, timestampMs, ...rest } as TranscriptEntry;
}

const CODE_REPLY = [
  "Done. `src/middleware/rateLimit.ts` now uses a token bucket per customer (burst 20, refill 5/s), and every 429 carries `Retry-After`.",
  "",
  "```ts",
  'const bucket = buckets.get(key) ?? createBucket({ capacity: 20, refillPerSecond: 5 });',
  "if (!bucket.take()) {",
  '  res.setHeader("Retry-After", String(bucket.secondsUntilNext()));',
  '  return res.status(429).json({ error: "rate_limited" });',
  "}",
  "```",
  "",
  "Unit tests: 14 passed.",
].join("\n");

export const DEMO_TRANSCRIPTS: Readonly<Record<string, readonly TranscriptEntry[]>> = {
  "room-checkout": [
    entry("message", minutesAgo(26), { content: "We're seeing bursts of 429s on /checkout during flash sales. @Atlas plan a fix, @Forge build it, @Lens review before we ship.", author: { id: "user", name: "Ray" } }),
    entry("send-message", minutesAgo(25.4), { message: { type: "text", content: "Plan:\n1. Replace the fixed-window limiter with a token bucket per customer.\n2. Return `Retry-After` on 429 so clients back off.\n3. Add a load test that replays a flash-sale burst.\n\n@Forge takes 1–2, I'll draft 3." }, author: { id: "atlas", name: "Atlas" } }),
    entry("send-message", minutesAgo(23.9), { message: { type: "text", content: CODE_REPLY }, author: { id: "forge", name: "Forge" } }),
    entry("send-message", minutesAgo(23.1), { message: { type: "text", content: "Looks good. One edge case: guest checkouts have no customer id, so every guest shares a single bucket. Key guests by session id instead?" }, author: { id: "lens", name: "Lens" }, reactions: [{ emoji: "👍", by: "me" }] }),
    entry("send-message", minutesAgo(22.4), { message: { type: "text", content: "Good catch. Guests now fall back to the session id, and there's a test with two concurrent guests." }, author: { id: "forge", name: "Forge" } }),
    entry("send-message", minutesAgo(21.6), { message: { type: "text", content: "Load test is in: a 500 rps burst for 30s gives p99 112ms, zero 5xx, and 429s only above the bucket. Ready to ship." }, author: { id: "atlas", name: "Atlas" } }),
    entry("message", minutesAgo(2), { content: "Ship it. @Lens one last pass on the load-test numbers?", author: { id: "user", name: "Ray" } }),
  ],
  forge: [
    entry("message", minutesAgo(9), { content: "Run the staging migration for the new rate-limit table.", author: { id: "user", name: "Ray" } }),
    entry("send-message", minutesAgo(8.6), { message: { type: "text", content: "Migration is ready. It needs your approval before it runs on staging." }, author: { id: "forge", name: "Forge" } }),
    entry("prompt", minutesAgo(8.5), { prompt: FORGE_PROMPT, status: "pending" }),
  ],
  scout: [
    entry("message", minutesAgo(48), { content: "Does Stripe also return Retry-After on 429? Ask Forge whether our client already honors it.", author: { id: "user", name: "Ray" } }),
    entry("send-message", minutesAgo(47.5), { message: { type: "text", content: "Yes. Stripe sends `Retry-After` with rate-limited responses (docs → Rate limits). I've asked Forge about our client and will report back." }, author: { id: "scout", name: "Scout" } }),
    entry("notice", minutesAgo(47.4), { content: "Sent a message to Forge", event: { type: "bot-message-sent", targetChatId: "forge", targetName: "Forge", targetKind: "bot" } }),
    entry("send-message", minutesAgo(46.2), { message: { type: "text", content: "Forge confirmed: our Stripe client retries with exponential backoff and respects `Retry-After` (max 3 attempts). Nothing to change." }, author: { id: "scout", name: "Scout" } }),
  ],
  lens: [entry("send-message", minutesAgo(140), { message: { type: "text", content: "Reviewed PR #482: two nits on naming, no blockers." }, author: { id: "lens", name: "Lens" } })],
  "room-release": [
    entry("message", minutesAgo(190), { content: "What's left for 2.4?", author: { id: "user", name: "Ray" } }),
    entry("send-message", minutesAgo(189), { message: { type: "text", content: "Two items: the checkout rate limits, and the new receipt email. Everything else is merged." }, author: { id: "atlas", name: "Atlas" } }),
    entry("send-message", minutesAgo(188), { message: { type: "text", content: "The receipt email matches the design system now. Spacing on mobile is fixed." }, author: { id: "pixel", name: "Pixel" } }),
  ],
  atlas: [
    entry("message", minutesAgo(320), { content: "Draft the rollout plan for 2.4.", author: { id: "user", name: "Ray" } }),
    entry("send-message", minutesAgo(318), { message: { type: "text", content: "Rollout: 5% on Monday, 50% on Tuesday, 100% on Wednesday, with an automatic rollback if checkout errors rise above 0.5%." }, author: { id: "atlas", name: "Atlas" } }),
  ],
  pixel: [entry("send-message", minutesAgo(600), { message: { type: "text", content: "New icons are exported at 1x/2x/3x." }, author: { id: "pixel", name: "Pixel" } })],
};
