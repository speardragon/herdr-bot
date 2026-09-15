import type { ReactNode } from "react";
import { t } from "./locale";
import { AgentAvatar } from "../recovered/features/conversation/workspace/agent-avatar";
import { SandIcon } from "../recovered/ui/sand-kit-primitives";
import type { SandIconName } from "../recovered/ui/sand-icon-registry";
import { commandPaletteHasChildren, type CommandPaletteAgent, type CommandPaletteEntry } from "./command-palette-model";
import { commandPaletteLinkDisplayUrl, type CommandPaletteLinkMetadata } from "./command-palette-link-provider";
import type { CommandPaletteMessage } from "./command-palette-message-provider";
import { paletteAgentSubtitle, paletteFileIconName } from "./command-palette-row-model";

export interface CommandPaletteRowProps {
  readonly entry: CommandPaletteEntry;
  readonly agents: readonly CommandPaletteAgent[];
  readonly linkMetadata: Readonly<Record<string, CommandPaletteLinkMetadata>>;
  readonly id: string;
  readonly isSelected: boolean;
  /** 1-based ⌘N badge number, or null for rows past the ninth / nested steps. */
  readonly shortcut: number | null;
  readonly modifierSymbol: string;
  onActivate(): void;
  onHover(): void;
}

interface RowProjection {
  readonly leading: ReactNode;
  /** Drives the gray circle: avatars render bare, every icon (and favicon) sits in a filled circle. */
  readonly leadingKind: "avatar" | "icon";
  readonly title: string;
  readonly subtitle: string | null;
  readonly trailing?: ReactNode;
}

function relativePaletteTime(timestampMs: number, nowMs = Date.now()): string {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return "";
  const seconds = Math.max(0, Math.floor((nowMs - timestampMs) / 1000));
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 30 * 86400) return `${Math.floor(seconds / 86400)}d ago`;
  if (seconds < 365 * 86400) return `${Math.floor(seconds / (30 * 86400))}mo ago`;
  return `${Math.floor(seconds / (365 * 86400))}y ago`;
}

function messagePaletteDetail(message: CommandPaletteMessage, agent: CommandPaletteAgent | undefined): string {
  const name = agent?.name ?? "";
  const speaker = agent?.isGroup === true
    ? (message.role === "user" ? `You in ${name}` : `In ${name}`)
    : (message.role === "user" ? `You to ${name}` : `${name} to you`);
  const time = relativePaletteTime(message.timestampMs);
  return [speaker, time].filter((value) => value.length > 0).join(" · ");
}

/** The 28px gray-circle leading slot used by every non-avatar row (reference: 멤버 / 채팅 설정). */
function iconLeading(name: SandIconName): ReactNode {
  return <SandIcon name={name} size="md" />;
}

function agentLeading(agent: CommandPaletteAgent): ReactNode {
  const kind = agent.isSharedRoom === true ? "shared-room" : agent.isGroup ? "group" : "agent";
  return <AgentAvatar agentId={agent.id} name={agent.name} kind={kind} memberIds={agent.memberIds} dataUrl={agent.avatarDataUrl} shape={agent.avatarShape} color={agent.avatarColor} size="md" isStatic />;
}

function projectRow(entry: CommandPaletteEntry, agents: readonly CommandPaletteAgent[], linkMetadata: Readonly<Record<string, CommandPaletteLinkMetadata>>): RowProjection {
  if (entry.kind === "agent") {
    const subtitle = paletteAgentSubtitle(entry.agent, agents);
    return { leading: agentLeading(entry.agent), leadingKind: "avatar", title: entry.agent.name, subtitle };
  }
  if (entry.kind === "command") {
    const trailing = <>
      {entry.command.isActive ? <span aria-label={t("Current")} className="sand-command-palette__check" role="img">✓</span> : null}
      {commandPaletteHasChildren(entry.command) ? <SandIcon className="sand-command-palette__chevron" name="chevron-right" size="sm" /> : null}
    </>;
    const title = t(entry.command.label);
    const subtitle = entry.command.detail == null ? null : t(entry.command.detail);
    // "Settings: General" translates to the same word as its "Settings" detail in ko; don't echo it.
    return { leading: iconLeading(entry.command.icon ?? "command"), leadingKind: "icon", title, subtitle: subtitle === title ? null : subtitle, trailing };
  }
  if (entry.kind === "message") {
    const agent = agents.find((candidate) => candidate.id === entry.message.agentId);
    return { leading: agent == null ? iconLeading("chat-bubble") : agentLeading(agent), leadingKind: agent == null ? "icon" : "avatar", title: entry.message.snippet, subtitle: messagePaletteDetail(entry.message, agent) || null };
  }
  if (entry.kind === "file") {
    const agent = agents.find((candidate) => candidate.id === entry.file.agentId);
    const dimensions = entry.file.width != null && entry.file.height != null ? `${entry.file.width}×${entry.file.height}` : null;
    return { leading: iconLeading(paletteFileIconName(entry.file.kind)), leadingKind: "icon", title: entry.file.fileName, subtitle: [agent?.name, dimensions].filter((value): value is string => value != null && value.length > 0).join(" · ") || null };
  }
  if (entry.kind === "link") {
    const data = linkMetadata[entry.link.url];
    const linkTitle = data?.title?.trim() ?? "";
    const displayUrl = commandPaletteLinkDisplayUrl(entry.link.url);
    const leading = data?.faviconDataUrl != null ? <img alt="" aria-hidden="true" draggable={false} src={data.faviconDataUrl} /> : iconLeading("globe");
    return { leading, leadingKind: "icon", title: linkTitle.length > 0 ? linkTitle : displayUrl, subtitle: linkTitle.length > 0 ? displayUrl : null };
  }
  return { leading: iconLeading("clock"), leadingKind: "icon", title: entry.routine.automation.name, subtitle: entry.routine.automation.triggerDescription || null };
}

/**
 * One palette result row, laid out like the Grok Bot reference: [28px avatar / gray icon circle]
 * [title over an optional ellipsized subtitle] [⌘N badge]. Purely presentational -- the subtitle,
 * command visibility, and file-icon projections it relies on live in command-palette-row-model.ts.
 */
export function CommandPaletteRow({ entry, agents, linkMetadata, id, isSelected, shortcut, modifierSymbol, onActivate, onHover }: CommandPaletteRowProps) {
  const row = projectRow(entry, agents, linkMetadata);
  return <button aria-selected={isSelected} className="sand-command-palette__row" id={id} onClick={onActivate} onMouseMove={onHover} role="option" type="button">
    <span aria-hidden="true" className="sand-command-palette__leading" data-kind={entry.kind} data-leading={row.leadingKind}>{row.leading}</span>
    <span className="sand-command-palette__body">
      <span className="sand-command-palette__title">{row.title}</span>
      {row.subtitle == null ? null : <span className="sand-command-palette__subtitle">{row.subtitle}</span>}
    </span>
    {row.trailing}
    {shortcut == null ? null : <kbd aria-hidden="true" className="sand-command-palette__kbd">{`${modifierSymbol}${shortcut}`}</kbd>}
  </button>;
}
