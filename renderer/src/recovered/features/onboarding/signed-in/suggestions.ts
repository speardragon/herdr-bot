import { CHARACTER_COLORS, CHARACTER_SHAPES } from "./model";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L512

// Exact shipped catalog: immutable renderer JS bytes 4,479,912-4,486,061.
// Exact ranking starts at byte 4,486,867; card identity starts at byte 5,396,514.
const TOOL_TOKEN = "{tool}";

type Eligibility = { kind: "universal" } | { kind: "selected-tools"; recommendedIf: readonly string[] };
interface SuggestionTemplate { id: string; name: string; description: string; eligibility: Eligibility }
export type SuggestionDescriptionPart = { kind: "text"; text: string } | { kind: "tool"; label: string };
export interface OnboardingSuggestion { templateId: string; name: string; description: SuggestionDescriptionPart[] }
export interface SuggestionIdentity { color: string; shape: string }

export const ONBOARDING_SUGGESTION_CATALOG: readonly SuggestionTemplate[] = [
  { id: "night-shift", name: "Night Shift", description: "Works overnight and preps your morning digest", eligibility: { kind: "universal" } },
  { id: "inbox-triage", name: "Inbox Triage", description: "Sorts your email and drafts replies in your voice", eligibility: { kind: "universal" } },
  { id: "chief-of-staff", name: "Chief of Staff", description: "Manages your other Bots and pulls you in for decisions", eligibility: { kind: "universal" } },
  { id: "negotiator", name: "Negotiator", description: "Researches fair pricing and haggles in your voice", eligibility: { kind: "universal" } },
  { id: "prototyper", name: "Prototyper", description: "Turns your ideas into working prototypes", eligibility: { kind: "universal" } },
  { id: "researcher", name: "Researcher", description: "Digs into any question across your tools and the web", eligibility: { kind: "universal" } },
  { id: "shopper", name: "Shopper", description: "Gathers quotes and options into a clear comparison", eligibility: { kind: "universal" } },
  { id: "apartment-scout", name: "Apartment Scout", description: "Shortlists listings the moment they drop and books tours", eligibility: { kind: "universal" } },
  { id: "lookout", name: "Lookout", description: "Watches any site and alerts you to changes", eligibility: { kind: "universal" } },
  { id: "competitor-watcher", name: "Competitor Watcher", description: "Tracks competitor pricing and launches, and briefs you weekly", eligibility: { kind: "universal" } },
  { id: "crm-scribe", name: "CRM Scribe", description: `Turns your calls into ${TOOL_TOKEN} updates and follow-ups`, eligibility: { kind: "selected-tools", recommendedIf: ["Salesforce", "HubSpot", "Outreach", "Salesloft", "Apollo"] } },
  { id: "pipeline-scout", name: "Pipeline Scout", description: `Researches target accounts in ${TOOL_TOKEN} and builds your attack plan`, eligibility: { kind: "selected-tools", recommendedIf: ["Salesforce", "HubSpot", "Apollo", "Clay", "ZoomInfo", "LinkedIn", "Outreach", "Salesloft"] } },
  { id: "first-responder", name: "First Responder", description: `Answers new leads in minutes and books the meeting in ${TOOL_TOKEN}`, eligibility: { kind: "selected-tools", recommendedIf: ["Calendly", "HubSpot", "Salesforce", "Intercom", "Outreach", "Salesloft", "Apollo"] } },
  { id: "win-loss-analyst", name: "Win-Loss Analyst", description: `Reads every lost deal in ${TOOL_TOKEN} and reports why you’re really losing`, eligibility: { kind: "selected-tools", recommendedIf: ["Salesforce", "HubSpot", "Outreach", "Salesloft", "Apollo"] } },
  { id: "icebreaker", name: "Icebreaker", description: `Watches ${TOOL_TOKEN} for launches and hires worth a warm intro`, eligibility: { kind: "selected-tools", recommendedIf: ["LinkedIn", "Clay", "ZoomInfo", "Apollo", "Salesforce", "HubSpot"] } },
  { id: "call-coach", name: "Call Coach", description: `Rewatches your ${TOOL_TOKEN} calls and gives specific coaching`, eligibility: { kind: "selected-tools", recommendedIf: ["Zoom", "Nooks", "Loom", "Outreach", "Salesloft"] } },
  { id: "deck-designer", name: "Deck Designer", description: `Turns your notes into an on-brand ${TOOL_TOKEN} deck`, eligibility: { kind: "selected-tools", recommendedIf: ["Canva", "Figma", "Workspace", "Microsoft 365"] } },
  { id: "channel-digest", name: "Channel Digest", description: `Summarizes your ${TOOL_TOKEN} channels and flags what needs you`, eligibility: { kind: "selected-tools", recommendedIf: ["Slack", "Microsoft 365"] } },
  { id: "ticket-triager", name: "Ticket Triager", description: `Triages everything new in ${TOOL_TOKEN} and drafts the first reply`, eligibility: { kind: "selected-tools", recommendedIf: ["Zendesk", "Intercom", "Jira", "Trello", "monday.com", "ClickUp"] } },
  { id: "feedback-miner", name: "Feedback Miner", description: `Clusters your ${TOOL_TOKEN} feedback into clear themes`, eligibility: { kind: "selected-tools", recommendedIf: ["Zendesk", "Intercom", "Shopify", "Notion"] } },
  { id: "review-responder", name: "Review Responder", description: `Drafts on-brand replies to reviews and messages in ${TOOL_TOKEN}`, eligibility: { kind: "selected-tools", recommendedIf: ["Shopify", "Zendesk", "Intercom"] } },
  { id: "marketing-analyst", name: "Marketing Analyst", description: `Reports on ${TOOL_TOKEN} campaign performance and where to spend next`, eligibility: { kind: "selected-tools", recommendedIf: ["HubSpot", "Mailchimp", "Amplitude", "Mixpanel", "Shopify"] } },
  { id: "shopkeeper", name: "Shopkeeper", description: `Watches orders and payouts in ${TOOL_TOKEN} and flags anything odd`, eligibility: { kind: "selected-tools", recommendedIf: ["Shopify", "Stripe"] } },
  { id: "invoice-chaser", name: "Invoice Chaser", description: `Tracks unpaid ${TOOL_TOKEN} invoices and drafts the reminders`, eligibility: { kind: "selected-tools", recommendedIf: ["QuickBooks", "NetSuite", "Stripe", "Ramp"] } },
  { id: "expense-auditor", name: "Expense Auditor", description: `Files receipts in ${TOOL_TOKEN} daily and categorizes every charge`, eligibility: { kind: "selected-tools", recommendedIf: ["QuickBooks", "NetSuite", "Ramp", "Rippling", "Workday"] } },
  { id: "subscription-sleuth", name: "Subscription Sleuth", description: `Finds subscriptions you no longer use across your ${TOOL_TOKEN} spend`, eligibility: { kind: "selected-tools", recommendedIf: ["QuickBooks", "NetSuite", "Ramp", "Stripe"] } },
  { id: "paralegal", name: "Paralegal", description: `Reviews contracts in ${TOOL_TOKEN} and drafts redlines for approval`, eligibility: { kind: "selected-tools", recommendedIf: ["DocuSign", "Box", "Dropbox"] } },
  { id: "application-screener", name: "Application Screener", description: `Screens new ${TOOL_TOKEN} applications and surfaces the top candidates`, eligibility: { kind: "selected-tools", recommendedIf: ["Ashby", "Greenhouse", "Workday", "Rippling", "LinkedIn"] } },
  { id: "sourcing-scout", name: "Sourcing Scout", description: `Delivers qualified profiles matched to the roles open in ${TOOL_TOKEN}`, eligibility: { kind: "selected-tools", recommendedIf: ["Ashby", "Greenhouse", "Workday", "Rippling", "LinkedIn"] } },
  { id: "qa-engineer", name: "QA Engineer", description: `Clicks through every new ${TOOL_TOKEN} deploy and reports what breaks`, eligibility: { kind: "selected-tools", recommendedIf: ["Vercel", "GitHub"] } },
  { id: "dashboard-watcher", name: "Dashboard Watcher", description: `Watches your ${TOOL_TOKEN} metrics and alerts you on anomalies`, eligibility: { kind: "selected-tools", recommendedIf: ["Tableau", "Hex", "Amplitude", "Mixpanel", "Snowflake", "Databricks", "Stripe", "Shopify"] } },
  { id: "data-scientist", name: "Data Scientist", description: `Answers data questions with real ${TOOL_TOKEN} queries and charts`, eligibility: { kind: "selected-tools", recommendedIf: ["Tableau", "Hex", "Amplitude", "Mixpanel", "Snowflake", "Databricks"] } },
] as const;

function universal(template: SuggestionTemplate): OnboardingSuggestion {
  return { templateId: template.id, name: template.name, description: [{ kind: "text", text: template.description }] };
}
function withTool(template: SuggestionTemplate, tool: string): OnboardingSuggestion {
  const index = template.description.indexOf(TOOL_TOKEN);
  if (index < 0) return universal(template);
  const before = template.description.slice(0, index), after = template.description.slice(index + TOOL_TOKEN.length);
  return { templateId: template.id, name: template.name, description: [
    ...(before ? [{ kind: "text" as const, text: before }] : []), { kind: "tool", label: tool },
    ...(after ? [{ kind: "text" as const, text: after }] : []),
  ] };
}
function bestForTool(tool: string, used: Set<string>): SuggestionTemplate | null {
  let best: SuggestionTemplate | null = null, rank = Number.POSITIVE_INFINITY;
  for (const template of ONBOARDING_SUGGESTION_CATALOG) {
    if (used.has(template.id) || template.eligibility.kind !== "selected-tools") continue;
    const index = template.eligibility.recommendedIf.indexOf(tool);
    if (index >= 0 && index < rank) { best = template; rank = index; }
  }
  return best;
}
export function selectOnboardingSuggestions(tools: readonly string[], limit = 10): OnboardingSuggestion[] {
  const suggestions: OnboardingSuggestion[] = [], used = new Set<string>();
  for (const tool of tools) {
    if (suggestions.length >= limit) break;
    const template = bestForTool(tool, used);
    if (template) { used.add(template.id); suggestions.push(withTool(template, tool)); }
  }
  for (const template of ONBOARDING_SUGGESTION_CATALOG) {
    if (suggestions.length >= limit) break;
    if (used.has(template.id) || template.eligibility.kind !== "selected-tools") continue;
    const tool = template.eligibility.recommendedIf.find((candidate) => tools.includes(candidate));
    if (tool) { used.add(template.id); suggestions.push(withTool(template, tool)); }
  }
  for (const template of ONBOARDING_SUGGESTION_CATALOG) {
    if (suggestions.length >= limit) break;
    if (!used.has(template.id) && template.eligibility.kind === "universal") {
      used.add(template.id); suggestions.push(universal(template));
    }
  }
  return suggestions;
}
export function flattenSuggestionDescription(parts: readonly SuggestionDescriptionPart[]): string {
  return parts.map((part) => part.kind === "text" ? part.text : part.label).join("");
}
function fnv1a(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
function random(seed: number): () => number {
  let value = seed >>> 0;
  return () => { value = value + 1831565813 | 0; let next = Math.imul(value ^ value >>> 15, 1 | value); next = next + Math.imul(next ^ next >>> 7, 61 | next) ^ next; return ((next ^ next >>> 14) >>> 0) / 4294967296; };
}
function colorFor(name: string): string {
  const seeded = (fnv1a(name) ^ Math.imul(1, 2654435769)) >>> 0;
  return CHARACTER_COLORS[Math.floor(random((seeded ^ Math.imul(1, 2654435769)) >>> 0)() * CHARACTER_COLORS.length)]?.id ?? "brown";
}
function shapeFor(name: string): string {
  let hash = fnv1a(name); hash = Math.imul(hash ^ hash >>> 16, 73244475); hash = Math.imul(hash ^ hash >>> 13, 3266489909); hash = (hash ^ hash >>> 16) >>> 0;
  return CHARACTER_SHAPES[hash % CHARACTER_SHAPES.length] ?? "blob";
}
function unused(candidate: string, values: readonly string[], used: Set<string>): string {
  if (!used.has(candidate)) return candidate;
  const start = values.indexOf(candidate);
  for (let offset = 1; offset < values.length; offset += 1) { const value = values[(Math.max(start, 0) + offset) % values.length]; if (value && !used.has(value)) return value; }
  return candidate;
}
export function suggestionIdentities(suggestions: readonly OnboardingSuggestion[]): SuggestionIdentity[] {
  const colors = CHARACTER_COLORS.map(({ id }) => id), shapes = [...CHARACTER_SHAPES];
  const usedColors = new Set<string>(), usedShapes = new Set<string>();
  return suggestions.map(({ name }) => {
    const color = unused(colorFor(name), colors, usedColors), shape = unused(shapeFor(name), shapes, usedShapes);
    usedColors.add(color); usedShapes.add(shape); return { color, shape };
  });
}
