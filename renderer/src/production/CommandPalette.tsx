import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { t, useLocale } from "./locale";
import { SandIcon } from "../recovered/ui/sand-kit-primitives";
import { CommandPaletteRow } from "./CommandPaletteRow";
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
  type CommandPaletteEntry,
  type CommandPaletteTab
} from "./command-palette-model";
import type { CommandPaletteRoutine, CommandPaletteRoutineSnapshot } from "./command-palette-provider";
import type { CommandPaletteMessage, CommandPaletteMessageSnapshot } from "./command-palette-message-provider";
import type { CommandPaletteLink, CommandPaletteLinkMetadata, CommandPaletteLinkMetadataSnapshot } from "./command-palette-link-provider";
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

// Labels are English keys resolved through t() at render time ("Bots" → "Bot", "Actions" → "작업").
const TABS: readonly { id: CommandPaletteTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "messages", label: "Messages" },
  { id: "agents", label: "Bots" },
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
// The recovered palette keeps a 49px row + 2px gap pitch; commandPaletteVirtualWindow and
// commandPaletteScrollTopForRow encode the same numbers, as does .sand-command-palette__row's CSS
// height. Change all of them together or the keyboard scroll-into-view math drifts.
const PALETTE_ROW_PITCH_PX = 51;
const PALETTE_ROW_GAP_PX = 2;
const PALETTE_LEADING_OFFSET_PX = 8;
const PALETTE_OVERSCAN_ROWS = 6;
const PALETTE_EDGE_INSET_PX = 24;

function emptyLabel(tab: CommandPaletteTab, hasQuery: boolean): string {
  if (hasQuery) return t("No results");
  if (tab === "messages") return t("Search messages");
  if (tab === "groups") return t("No group chats yet");
  if (tab === "files") return t("No files yet");
  if (tab === "links") return t("No links in this chat yet");
  if (tab === "routines") return t("No routines yet");
  if (tab === "actions") return t("No actions");
  return t("No agents yet");
}

function emptyHint(tab: CommandPaletteTab, hasQuery: boolean): string | null {
  return !hasQuery && tab === "messages" ? t("Type to find messages across your chats.") : null;
}

function entryKey(entry: CommandPaletteEntry): string {
  if (entry.kind === "agent") return `agent:${entry.agent.id}`;
  if (entry.kind === "command") return `command:${entry.command.id}`;
  if (entry.kind === "message") return `message:${entry.message.agentId}:${entry.message.entryId}`;
  if (entry.kind === "link") return `link:${entry.link.url}`;
  if (entry.kind === "file") return `file:${entry.file.agentId}:${entry.file.entryId}`;
  return `routine:${entry.routine.agentId}:${entry.routine.automation.id}`;
}

export function CommandPalette({ agents, commands, routines, routineStatus, messages = [], messageStatus = "unavailable", isMessageSearchEnabled = false, files = [], fileStatus = "unavailable", isFileSearchEnabled = false, links = [], linkMetadata = {}, linkStatus = "unavailable", isLinkSearchEnabled = false, isOpen, onClose, onOpenAgent, onOpenRoutine, onOpenMessage, onOpenFile, onOpenLink, onSearchQueryChange }: CommandPaletteProps) {
  useLocale();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<CommandPaletteTab>("all");
  const [highlight, setHighlight] = useState(0);
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
  const hasQuery = query.trim().length > 0;
  const routineSearchUnavailable = (routineStatus === "failed" || routineStatus === "unavailable") && (tab === "routines" || tab === "all" && hasQuery);
  const routineSearchPending = routineStatus === "loading" && (tab === "routines" || tab === "all" && hasQuery);
  const fileSearchUnavailable = isFileSearchEnabled && (fileStatus === "failed" || fileStatus === "unavailable") && (tab === "files" || tab === "all" && hasQuery);
  const fileSearchPending = isFileSearchEnabled && fileStatus === "loading" && (tab === "files" || tab === "all" && hasQuery);
  const messageSearchUnavailable = isMessageSearchEnabled && (messageStatus === "failed" || messageStatus === "unavailable") && (tab === "messages" || tab === "all" && hasQuery);
  const messageSearchPending = isMessageSearchEnabled && messageStatus === "loading" && (tab === "messages" || tab === "all" && hasQuery);
  const linkMetadataPending = isLinkSearchEnabled && linkStatus === "loading";
  const searchUnavailable = routineSearchUnavailable || fileSearchUnavailable || messageSearchUnavailable;
  const searchPending = routineSearchPending || fileSearchPending || messageSearchPending;

  useEffect(() => {
    if (!isOpen) return;
    const activeElement = document.activeElement;
    returnFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    setQuery("");
    setTab("all");
    setHighlight(0);
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
  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (isNested) goBack(); else onClose();
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
      // preventDefault first: the root shell's global ⌘N "focus Nth chat" action bails on it.
      event.preventDefault();
      const index = paletteIndexedShortcutIndex(event.key, isNested, entries.length);
      if (index != null) activate(index);
    }
  };

  return <>
    <div aria-hidden="true" onMouseDown={(event) => { if (!event.ctrlKey) onClose(); }} style={PALETTE_BACKDROP_STYLE} />
    <section aria-label={t("Search")} aria-modal="true" className="sand-command-palette" onKeyDown={handlePaletteKeyDown} ref={paletteRef} role="dialog">
      {isNested
        ? <button aria-label={t("Back")} className="sand-command-palette__back" onClick={goBack} onMouseDown={(event) => event.preventDefault()} type="button"><SandIcon name="arrow-left" size="lg" /></button>
        : <SandIcon className="sand-command-palette__search-icon" name="search" size="lg" />}
      <input
        aria-activedescendant={entries.length === 0 ? undefined : `${listboxId}-row-${selected}`}
        aria-autocomplete="list"
        aria-controls={entries.length === 0 ? undefined : listboxId}
        aria-expanded={entries.length > 0}
        aria-label={t("Search")}
        onChange={(event) => { setQuery(event.currentTarget.value); onSearchQueryChange?.(event.currentTarget.value); setHighlight(0); }}
        onKeyDown={handleInputKeyDown}
        placeholder={t("Search")}
        ref={inputRef}
        role="combobox"
        type="text"
        value={query}
      />
      {searchUnavailable && entries.length > 0 ? <span aria-live="polite" className="sand-command-palette__status" role="status">{t("Search unavailable")}</span> : null}
      {!isNested ? <div aria-label={t("Filter results")} role="tablist">
        {tabs.map((candidate) => <button
          aria-selected={tab === candidate.id}
          key={candidate.id}
          onClick={() => { setTab(candidate.id); setHighlight(0); }}
          onMouseDown={(event) => event.preventDefault()}
          role="tab"
          tabIndex={-1}
          type="button"
        >{t(candidate.label)}</button>)}
      </div> : null}
      {entries.length === 0
        ? searchPending
          ? <div aria-busy="true" aria-label={t("Results")} id={listboxId} ref={listboxRef} role="listbox" />
          : <p className="sand-command-palette__empty" role={searchUnavailable ? "status" : undefined} aria-live={searchUnavailable ? "polite" : undefined}>
            <span>{searchUnavailable ? t("Search unavailable") : emptyLabel(tab, hasQuery)}</span>
            {searchUnavailable ? <small>{t("Try again in a moment.")}</small> : emptyHint(tab, hasQuery) == null ? null : <small>{emptyHint(tab, hasQuery)}</small>}
          </p>
        : <div aria-busy={searchPending || linkMetadataPending ? "true" : undefined} aria-label={t("Results")} id={listboxId} ref={listboxRef} role="listbox">
          {listWindow.start > 0 ? <div aria-hidden="true" style={{ height: Math.max(0, listWindow.start * PALETTE_ROW_PITCH_PX - PALETTE_ROW_GAP_PX) }} /> : null}
          {entries.slice(listWindow.start, listWindow.end).map((entry, offset) => {
            const index = listWindow.start + offset;
            return <CommandPaletteRow
              agents={agents}
              entry={entry}
              id={`${listboxId}-row-${index}`}
              isSelected={index === selected}
              key={entryKey(entry)}
              linkMetadata={linkMetadata}
              modifierSymbol={PALETTE_MODIFIER_SYMBOL}
              onActivate={() => activate(index)}
              onHover={() => setHighlight(index)}
              // Reference shows the ⌘N badges at rest, not only while ⌘ is held (the recovered
              // behaviour) -- so the modifier gate is always satisfied here.
              shortcut={paletteShortcutNumber(index, isNested, true)}
            />;
          })}
          {listWindow.end < entries.length ? <div aria-hidden="true" style={{ height: Math.max(0, (entries.length - listWindow.end) * PALETTE_ROW_PITCH_PX - PALETTE_ROW_GAP_PX) }} /> : null}
        </div>}
    </section>
  </>;
}
