import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  activateCommandPaletteEntry,
  commandPaletteHasChildren,
  commandPaletteEntries,
  commandPaletteScrollTopForRow,
  commandPaletteVirtualWindow,
  cyclePaletteTab,
  enterCommandPaletteStep,
  movePaletteHighlight,
  paletteIndexedShortcutIndex,
  paletteShortcutNumber,
  popCommandPaletteStep,
  resolveCommandPaletteStep,
  type CommandPaletteAgent,
  type CommandPaletteCommand,
  type CommandPaletteTab
} from "./command-palette-model";
import type { CommandPaletteRoutine, CommandPaletteRoutineSnapshot } from "./command-palette-provider";
import type { CommandPaletteMessage, CommandPaletteMessageSnapshot } from "./command-palette-message-provider";
import { commandPaletteLinkDisplayUrl, type CommandPaletteLink, type CommandPaletteLinkMetadata, type CommandPaletteLinkMetadataSnapshot } from "./command-palette-link-provider";
import type { CommandPaletteFile, CommandPaletteFileSnapshot } from "./command-palette-search-provider";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L523

export interface CommandPaletteProps {
  agents: readonly CommandPaletteAgent[];
  commands: readonly CommandPaletteCommand[];
  routines: readonly CommandPaletteRoutine[];
  routineStatus: CommandPaletteRoutineSnapshot["status"];
  messages?: readonly CommandPaletteMessage[];
  messageStatus?: CommandPaletteMessageSnapshot["status"];
  isMessageSearchEnabled?: boolean;
  files?: readonly CommandPaletteFile[];
  fileStatus?: CommandPaletteFileSnapshot["status"];
  isFileSearchEnabled?: boolean;
  links?: readonly CommandPaletteLink[];
  linkMetadata?: Readonly<Record<string, CommandPaletteLinkMetadata>>;
  linkStatus?: CommandPaletteLinkMetadataSnapshot["status"];
  isLinkSearchEnabled?: boolean;
  isOpen: boolean;
  onClose(): void;
  onOpenAgent(agentId: string): void;
  onOpenRoutine(agentId: string): void;
  onOpenMessage?(message: CommandPaletteMessage): void;
  onOpenFile?(file: CommandPaletteFile): void;
  onOpenLink?(url: string): void;
  onSearchQueryChange?(query: string): void;
}

const TABS: readonly { id: CommandPaletteTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "messages", label: "Messages" },
  { id: "agents", label: "Agents" },
  { id: "groups", label: "Groups" },
  { id: "files", label: "Files" },
  { id: "links", label: "Links" },
  { id: "routines", label: "Routines" },
  { id: "actions", label: "Actions" }
];
const PALETTE_MODIFIER_SYMBOL = typeof navigator !== "undefined" && /mac/i.test(navigator.platform) ? "⌘" : "⌃";
const PALETTE_BACKDROP_STYLE = {
  backgroundColor: "var(--sand-bg-scrim)",
  inset: 0,
  position: "fixed",
  zIndex: 3000
} as const;
const PALETTE_BACK_BUTTON_STYLE = {
  alignItems: "center",
  background: "transparent",
  border: 0,
  color: "inherit",
  display: "flex",
  fontSize: "18px",
  height: 36,
  justifyContent: "center",
  left: 8,
  padding: 0,
  position: "absolute",
  top: 7,
  width: 36,
  zIndex: 1
} as const;
const PALETTE_NESTED_INPUT_STYLE = { paddingLeft: 52 } as const;

function emptyLabel(tab: CommandPaletteTab, hasQuery: boolean): string {
  if (hasQuery) return "No results";
  if (tab === "messages") return "Search messages";
  if (tab === "groups") return "No group chats yet";
  if (tab === "files") return "No files yet";
  if (tab === "links") return "No links in this chat yet";
  if (tab === "routines") return "No routines yet";
  if (tab === "actions") return "No actions";
  return "No agents yet";
}

function emptyHint(tab: CommandPaletteTab, hasQuery: boolean): string | null {
  return !hasQuery && tab === "messages" ? "Type to find messages across your chats." : null;
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

export function CommandPalette({ agents, commands, routines, routineStatus, messages = [], messageStatus = "unavailable", isMessageSearchEnabled = false, files = [], fileStatus = "unavailable", isFileSearchEnabled = false, links = [], linkMetadata = {}, linkStatus = "unavailable", isLinkSearchEnabled = false, isOpen, onClose, onOpenAgent, onOpenRoutine, onOpenMessage, onOpenFile, onOpenLink, onSearchQueryChange }: CommandPaletteProps) {
  const PALETTE_ROW_PITCH_PX = 51;
  const PALETTE_ROW_GAP_PX = 2;
  const PALETTE_LEADING_OFFSET_PX = 8;
  const PALETTE_OVERSCAN_ROWS = 6;
  const PALETTE_EDGE_INSET_PX = 24;
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<CommandPaletteTab>("all");
  const [highlight, setHighlight] = useState(0);
  const [isModifierHeld, setModifierHeld] = useState(false);
  const [commandTrail, setCommandTrail] = useState<readonly string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const listboxId = useId();
  const commandStep = useMemo(() => resolveCommandPaletteStep(commands, commandTrail), [commands, commandTrail]);
  const currentCommands = commandStep.commands;
  const isNested = commandStep.depth > 0;
  const tabs = useMemo(() => TABS.filter((candidate) => (candidate.id !== "files" || isFileSearchEnabled) && (candidate.id !== "messages" || isMessageSearchEnabled) && (candidate.id !== "links" || isLinkSearchEnabled)), [isFileSearchEnabled, isLinkSearchEnabled, isMessageSearchEnabled]);
  const tabIds = useMemo(() => tabs.map(({ id }) => id), [tabs]);
  const entries = useMemo(() => commandPaletteEntries({ agents, commands: currentCommands, messages, files, links, routines, query, tab }), [agents, currentCommands, files, links, messages, query, routines, tab]);
  const [listWindow, setListWindow] = useState(() => commandPaletteVirtualWindow({ rowCount: entries.length, rowPitchPx: PALETTE_ROW_PITCH_PX, leadingOffsetPx: PALETTE_LEADING_OFFSET_PX, scrollTopPx: 0, viewportPx: 360, overscanRows: PALETTE_OVERSCAN_ROWS }));
  const selected = entries.length === 0 ? 0 : Math.min(Math.max(highlight, 0), entries.length - 1);
  const paletteRef = useRef<HTMLElement>(null);
  const routineSearchUnavailable = (routineStatus === "failed" || routineStatus === "unavailable") && (tab === "routines" || tab === "all" && query.trim().length > 0);
  const routineSearchPending = routineStatus === "loading" && (tab === "routines" || tab === "all" && query.trim().length > 0);
  const fileSearchUnavailable = isFileSearchEnabled && (fileStatus === "failed" || fileStatus === "unavailable") && (tab === "files" || tab === "all" && query.trim().length > 0);
  const fileSearchPending = isFileSearchEnabled && fileStatus === "loading" && (tab === "files" || tab === "all" && query.trim().length > 0);
  const messageSearchUnavailable = isMessageSearchEnabled && (messageStatus === "failed" || messageStatus === "unavailable") && (tab === "messages" || tab === "all" && query.trim().length > 0);
  const messageSearchPending = isMessageSearchEnabled && messageStatus === "loading" && (tab === "messages" || tab === "all" && query.trim().length > 0);
  const linkMetadataPending = isLinkSearchEnabled && linkStatus === "loading";

  useEffect(() => {
    if (!isOpen) return;
    const activeElement = document.activeElement;
    returnFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    setQuery("");
    setTab("all");
    setHighlight(0);
    setModifierHeld(false);
    setCommandTrail([]);
    onSearchQueryChange?.("");
    inputRef.current?.select();
    return () => {
      const returnFocusTarget = returnFocusRef.current;
      returnFocusRef.current = null;
      if (returnFocusTarget?.isConnected) returnFocusTarget.focus({ preventScroll: true });
    };
  }, [isOpen, onSearchQueryChange]);

  useEffect(() => {
    if (!tabs.some((candidate) => candidate.id === tab)) setTab("all");
  }, [tab, tabs]);

  const updateListWindow = (element: HTMLDivElement | null) => {
    if (element == null) return;
    setListWindow(commandPaletteVirtualWindow({
      rowCount: entries.length,
      rowPitchPx: PALETTE_ROW_PITCH_PX,
      leadingOffsetPx: PALETTE_LEADING_OFFSET_PX,
      scrollTopPx: element.scrollTop,
      viewportPx: element.clientHeight || 360,
      overscanRows: PALETTE_OVERSCAN_ROWS
    }));
  };

  useEffect(() => {
    const element = listboxRef.current;
    if (element == null) return;
    const onScroll = () => updateListWindow(element);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onScroll);
    element.addEventListener("scroll", onScroll, { passive: true });
    resizeObserver?.observe(element);
    updateListWindow(element);
    return () => {
      element.removeEventListener("scroll", onScroll);
      resizeObserver?.disconnect();
    };
  }, [entries.length, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const element = listboxRef.current;
    if (element == null) return;
    element.scrollTop = 0;
    updateListWindow(element);
  }, [isOpen, isNested, query, tab]);

  useEffect(() => {
    if (!isOpen || entries.length === 0) return;
    const element = listboxRef.current;
    if (element == null) return;
    const nextScrollTop = commandPaletteScrollTopForRow({
      rowIndex: selected,
      rowPitchPx: PALETTE_ROW_PITCH_PX,
      rowGapPx: PALETTE_ROW_GAP_PX,
      leadingOffsetPx: PALETTE_LEADING_OFFSET_PX,
      scrollTopPx: element.scrollTop,
      viewportPx: element.clientHeight || 360,
      edgeInsetPx: PALETTE_EDGE_INSET_PX
    });
    if (nextScrollTop == null) return;
    element.scrollTop = nextScrollTop;
    updateListWindow(element);
  }, [entries.length, isOpen, selected]);

  useLayoutEffect(() => {
    if (!isOpen || entries.length === 0) return;
    const activeRow = listboxRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (typeof activeRow?.scrollIntoView !== "function") return;
    activeRow?.scrollIntoView({ block: "nearest" });
  }, [entries, isOpen, listWindow.end, listWindow.start, selected]);

  if (!isOpen) return null;
  const activate = (index: number) => {
    const entry = entries[index];
    if (entry == null) return;
    if (entry.kind === "command" && commandPaletteHasChildren(entry.command)) {
      setCommandTrail((current) => enterCommandPaletteStep(commands, current, entry.command.id));
      setQuery("");
      onSearchQueryChange?.("");
      setHighlight(0);
      inputRef.current?.focus();
      return;
    }
    activateCommandPaletteEntry(entry, onOpenAgent, onOpenRoutine, onOpenFile, onOpenMessage, onOpenLink);
    onClose();
  };
  const goBack = () => {
    if (!isNested) return;
    setCommandTrail((current) => popCommandPaletteStep(commands, current));
    setQuery("");
    onSearchQueryChange?.("");
    setHighlight(0);
    inputRef.current?.focus();
  };
  const handlePaletteKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (isNested) goBack();
      else onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(paletteRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]):not([tabindex='-1']), input:not([disabled])") ?? []);
    if (focusable.length === 0) return;
    const active = document.activeElement;
    const activeIndex = active instanceof HTMLElement ? focusable.indexOf(active) : -1;
    const nextIndex = event.shiftKey ? activeIndex - 1 : activeIndex + 1;
    if (activeIndex < 0 || nextIndex < 0 || nextIndex >= focusable.length) {
      event.preventDefault();
      focusable[event.shiftKey ? focusable.length - 1 : 0]?.focus();
    }
  };

  return <>
    <div aria-hidden="true" onMouseDown={(event) => { if (!event.ctrlKey) onClose(); }} style={PALETTE_BACKDROP_STYLE} />
    <section aria-label="Search" aria-modal="true" className="sand-command-palette" onKeyDown={handlePaletteKeyDown} ref={paletteRef} role="dialog">
      {isNested ? <button
        aria-label="Back"
        onClick={goBack}
        onMouseDown={(event) => event.preventDefault()}
        style={PALETTE_BACK_BUTTON_STYLE}
        type="button"
      ><span aria-hidden="true" data-icon-name="arrow-left" data-size="base" style={{ fontFamily: "cursor-icons" }}>{String.fromCodePoint(0xea9b)}</span></button> : null}
      <input
        aria-activedescendant={entries.length === 0 ? undefined : `${listboxId}-row-${selected}`}
        aria-autocomplete="list"
        aria-controls={entries.length === 0 ? undefined : listboxId}
        aria-expanded={entries.length > 0}
        aria-label="Search"
        onChange={(event) => { setQuery(event.currentTarget.value); onSearchQueryChange?.(event.currentTarget.value); setHighlight(0); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            if (isNested) { event.preventDefault(); goBack(); } else { event.preventDefault(); onClose(); }
            return;
          }
          if (event.key === "Meta" || event.key === "Control") {
            setModifierHeld(true);
            return;
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setHighlight((current) => movePaletteHighlight(current, entries.length, event.key === "ArrowDown" ? 1 : -1));
            return;
          }
          if (event.key === "Backspace" && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.currentTarget.value.length === 0 && isNested) {
            event.preventDefault();
            goBack();
            return;
          }
          if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && event.currentTarget.value.length === 0 && !isNested) {
            event.preventDefault();
            setTab((current) => cyclePaletteTab(current, event.key === "ArrowRight" ? 1 : -1, tabIds));
            setHighlight(0);
            return;
          }
          if (event.key === "Enter" && entries[selected] != null) { event.preventDefault(); activate(selected); }
          if (event.key === "Tab") {
            event.preventDefault();
            if (!isNested) {
              setTab((current) => cyclePaletteTab(current, event.shiftKey ? -1 : 1, tabIds));
              setHighlight(0);
            }
            return;
          }
          if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key >= "1" && event.key <= "9") {
            event.preventDefault();
            const index = paletteIndexedShortcutIndex(event.key, isNested, entries.length);
            if (index != null) activate(index);
          }
        }}
        onKeyUp={(event) => {
          if (event.key === "Meta" || event.key === "Control") setModifierHeld(false);
        }}
        placeholder="Search"
        ref={inputRef}
        role="combobox"
        style={isNested ? PALETTE_NESTED_INPUT_STYLE : undefined}
        type="text"
        value={query}
      />
      {(routineSearchUnavailable || fileSearchUnavailable || messageSearchUnavailable) && entries.length > 0 ? <span aria-live="polite" role="status">Search unavailable</span> : null}
      {!isNested ? <div aria-label="Filter results" role="tablist">
        {tabs.map((candidate) => <button
          aria-selected={tab === candidate.id}
          key={candidate.id}
          onClick={() => { setTab(candidate.id); setHighlight(0); }}
          onMouseDown={(event) => event.preventDefault()}
          role="tab"
          tabIndex={-1}
          type="button"
        >{candidate.label}</button>)}
      </div> : null}
      {entries.length === 0 ? routineSearchPending || fileSearchPending || messageSearchPending ? <div aria-busy="true" aria-label="Results" id={listboxId} ref={listboxRef} role="listbox" /> : routineSearchUnavailable || fileSearchUnavailable || messageSearchUnavailable ? <p aria-live="polite" role="status"><span>Search unavailable</span><small>Try again in a moment.</small></p> : <p>{emptyLabel(tab, query.trim().length > 0)}{emptyHint(tab, query.trim().length > 0) == null ? null : <small>{emptyHint(tab, query.trim().length > 0)}</small>}</p> : <div aria-busy={routineSearchPending || fileSearchPending || messageSearchPending || linkMetadataPending ? "true" : undefined} aria-label="Results" id={listboxId} ref={listboxRef} role="listbox">
        {listWindow.start > 0 ? <div aria-hidden="true" style={{ height: Math.max(0, listWindow.start * PALETTE_ROW_PITCH_PX - PALETTE_ROW_GAP_PX) }} /> : null}
        {entries.slice(listWindow.start, listWindow.end).map((entry, offset) => {
          const index = listWindow.start + offset;
          const label = entry.kind === "agent" ? entry.agent.name : entry.kind === "command" ? entry.command.label : entry.kind === "message" ? entry.message.snippet : entry.kind === "file" ? entry.file.fileName : entry.kind === "link" ? commandPaletteLinkDisplayUrl(entry.link.url) : entry.routine.automation.name;
          const messageAgent = entry.kind === "message" ? agents.find((agent) => agent.id === entry.message.agentId) : undefined;
          const fileAgent = entry.kind === "file" ? agents.find((agent) => agent.id === entry.file.agentId) : undefined;
          const linkData = entry.kind === "link" ? linkMetadata[entry.link.url] : undefined;
          const linkTitle = entry.kind === "link" ? (linkData?.title?.trim() ?? "") : "";
          const fileDimensions = entry.kind === "file" && entry.file.width != null && entry.file.height != null ? `${entry.file.width}×${entry.file.height}` : null;
          const detail = entry.kind === "agent" ? (entry.agent.isGroup ? "Group" : "Agent") : entry.kind === "command" ? entry.command.detail : entry.kind === "message" ? messagePaletteDetail(entry.message, messageAgent) : entry.kind === "link" ? (linkTitle.length > 0 ? commandPaletteLinkDisplayUrl(entry.link.url) : undefined) : entry.kind === "file" ? [fileAgent?.name, fileDimensions].filter((value): value is string => value != null && value.length > 0).join(" · ") || undefined : entry.routine.automation.triggerDescription;
          const shortcut = paletteShortcutNumber(index, isNested, isModifierHeld);
          return <button
            aria-selected={index === selected}
            id={`${listboxId}-row-${index}`}
            key={entry.kind === "agent" ? `agent:${entry.agent.id}` : entry.kind === "command" ? `command:${entry.command.id}` : entry.kind === "message" ? `message:${entry.message.agentId}:${entry.message.entryId}` : entry.kind === "link" ? `link:${entry.link.url}` : entry.kind === "file" ? `file:${entry.file.agentId}:${entry.file.entryId}` : `routine:${entry.routine.agentId}:${entry.routine.automation.id}`}
            onClick={() => activate(index)}
            onMouseMove={() => setHighlight(index)}
            role="option"
            type="button"
          >{entry.kind === "routine" ? <span aria-hidden="true" data-icon-name="clock" data-size="sm" /> : entry.kind === "message" ? <span aria-hidden="true" data-icon-name={messageAgent == null ? "chat-bubble" : "agent"} data-size="sm" /> : entry.kind === "link" ? linkData?.faviconDataUrl != null ? <img alt="" aria-hidden="true" draggable={false} src={linkData.faviconDataUrl} /> : <span aria-hidden="true" data-icon-name="globe" data-size="sm" /> : entry.kind === "file" ? <span aria-hidden="true" data-icon-name={entry.file.kind} data-size="sm" /> : null}<span>{entry.kind === "link" && linkTitle.length > 0 ? linkTitle : label}</span>{detail == null ? null : <small>{detail}</small>}{entry.kind === "command" && !isNested && tab === "all" ? <small>Action</small> : entry.kind === "message" && tab === "all" ? <small>Message</small> : entry.kind === "file" && tab === "all" ? <small>File</small> : entry.kind === "link" && tab === "all" ? <small>Link</small> : null}{entry.kind === "agent" && entry.isHidden ? <small>Hidden</small> : null}{entry.kind === "command" && entry.command.isActive ? <small aria-label="Current" role="img">✓</small> : null}{entry.kind === "command" && commandPaletteHasChildren(entry.command) ? <span aria-hidden="true" data-icon-name="chevron-right" data-size="sm" style={{ fontFamily: "cursor-icons" }}>{String.fromCodePoint(0xeab6)}</span> : null}{shortcut == null ? null : <small style={{ marginLeft: detail == null ? "auto" : undefined }}>{`${PALETTE_MODIFIER_SYMBOL}${shortcut}`}</small>}</button>;
        })}
        {listWindow.end < entries.length ? <div aria-hidden="true" style={{ height: Math.max(0, (entries.length - listWindow.end) * PALETTE_ROW_PITCH_PX - PALETTE_ROW_GAP_PX) }} /> : null}
      </div>}
    </section>
  </>;
}
