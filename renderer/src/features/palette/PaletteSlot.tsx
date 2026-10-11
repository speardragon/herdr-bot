import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { useActiveChat } from "../../data/hooks/useActiveChat.ts";
import { useChats } from "../../data/hooks/useChats.ts";
import { useTheme } from "../../data/hooks/useTheme.ts";
import { useBridge } from "../../data/BridgeContext.tsx";
import { useStoreContext } from "../../data/store/StoreProvider.tsx";
import type { ChatSummary, MessageSearchHit } from "../../data/types.ts";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { useFocusTrap } from "../../primitives/useFocusTrap.ts";
import { useShortcut } from "../../shell/ShortcutsProvider.tsx";
import { useDialogs } from "../dialogs/useDialogs.tsx";
import { clampIndex, moveIndex } from "../sidebar/list-nav.ts";
import { PALETTE_ACTIONS, filterActions } from "./actions.ts";
import type { PaletteActionDef, PaletteActionId } from "./actions.ts";
import { requestJumpToMessage } from "../../data/jump-target.ts";
import { filterChats, filterChatsByKind } from "./filter-chats.ts";
import { onPaletteOpenRequested } from "./palette-bus.ts";
import { PaletteResultRow } from "./PaletteResultRow.tsx";
import type { PaletteResult } from "./PaletteResultRow.tsx";
import { visibleTabs } from "./tabs.ts";
import type { PaletteTabId } from "./tabs.ts";
import styles from "./PaletteSlot.module.css";

const MESSAGE_SEARCH_DEBOUNCE_MS = 150;

/**
 * Global ⌘K command palette: search across chat names/descriptions and message content,
 * tabbed results, ⌘-digit quick picks, and the static Actions list. Mounted once by `App.tsx`. The
 * sidebar's Search button opens this via `palette-bus.ts`'s `requestPaletteOpen()` rather than owning
 * any search UI of its own -- it's a button, not a live-filter input.
 */
export function PaletteSlot() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<PaletteTabId>("all");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [messageHits, setMessageHits] = useState<readonly MessageSearchHit[]>([]);
  const chats = useChats();
  const { setActiveChatId } = useActiveChat();
  const { client } = useStoreContext();
  const bridge = useBridge();
  const dialogs = useDialogs();
  const theme = useTheme();
  const { t, locale } = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open);

  useShortcut("palette.open", "mod+k", () => setOpen(true));

  useEffect(
    () =>
      onPaletteOpenRequested(({ initialQuery }) => {
        setQuery(initialQuery);
        setSelectedIndex(0);
        setOpen(true);
      }),
    [],
  );

  // Debounced, stale-response-guarded `message.search` (a real host call, not derivable from the
  // already-loaded chat list) -- re-runs only while the palette is open and the query is non-empty.
  useEffect(() => {
    const needle = query.trim();
    if (!open || needle.length === 0) {
      setMessageHits([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void client.call("message.search", { query: needle }).then((hits) => {
        if (!cancelled) setMessageHits(hits);
      });
    }, MESSAGE_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, client]);

  const chatMatches = useMemo(() => filterChats(chats, query), [chats, query]);
  const sortedMessageHits = useMemo(() => [...messageHits].sort((a, b) => b.timestampMs - a.timestampMs), [messageHits]);

  const tabs = useMemo(() => {
    const bots = chats.filter((chat) => chat.kind === "bot").length;
    const groups = chats.filter((chat) => chat.kind === "room").length;
    return visibleTabs({ bots, groups });
  }, [chats]);

  useEffect(() => {
    if (!tabs.includes(activeTab)) setActiveTab("all");
  }, [tabs, activeTab]);

  const actionLabels = useMemo(() => new Map(PALETTE_ACTIONS.map((action) => [action.id, t(action.labelKey)])), [t]);
  const matchingActions = useMemo(() => filterActions(PALETTE_ACTIONS, actionLabels, query), [actionLabels, query]);

  function chatResult(chat: ChatSummary): PaletteResult {
    return { kind: "chat", chat };
  }
  function hitResult(hit: MessageSearchHit): PaletteResult {
    return { kind: "message", hit, chat: chats.find((chat) => chat.id === hit.chatId) ?? null };
  }
  function actionResult(action: PaletteActionDef): PaletteResult {
    return { kind: "action", action, label: actionLabels.get(action.id) ?? action.labelKey };
  }

  const results = useMemo<readonly PaletteResult[]>(() => {
    switch (activeTab) {
      case "messages":
        return sortedMessageHits.map(hitResult);
      case "bots":
        return filterChatsByKind(chats, query, "bot").map(chatResult);
      case "groups":
        return filterChatsByKind(chats, query, "room").map(chatResult);
      case "actions":
        return matchingActions.map(actionResult);
      case "all":
      default:
        return [...chatMatches.map(chatResult), ...sortedMessageHits.map(hitResult)];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chatResult/hitResult/actionResult close over chats/actionLabels, already deps below
  }, [activeTab, chatMatches, sortedMessageHits, chats, query, matchingActions, actionLabels]);

  const clampedIndex = clampIndex(selectedIndex, results.length);
  const nowMs = Date.now();

  if (!open) return null;

  function close() {
    setOpen(false);
    setQuery("");
    setActiveTab("all");
    setSelectedIndex(0);
    setMessageHits([]);
  }

  function runAction(id: PaletteActionId) {
    if (id === "newBot") dialogs.openNewBotDialog();
    else if (id === "newRoom") dialogs.openNewRoomDialog();
    else if (id === "settings") dialogs.openSettings();
    else if (id === "toggleTheme") theme.setPreference(theme.resolved === "dark" ? "light" : "dark");
  }

  function activate(result: PaletteResult) {
    if (result.kind === "chat") {
      setActiveChatId(result.chat.id);
    } else if (result.kind === "message") {
      setActiveChatId(result.hit.chatId);
      requestJumpToMessage(result.hit.chatId, result.hit.entryId);
    } else {
      runAction(result.action.id);
    }
    close();
  }

  // Attached to the scrim (not just the input) so ⌘-digit/arrow/Enter keep working after focus has
  // moved off the input -- e.g. after clicking a tab button, which is a real `<button>` and takes real
  // DOM focus. Escape lives here too (same reasoning), consolidating every palette shortcut into one
  // handler that works regardless of which inner element currently has focus.
  function onPaletteKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      close();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex(moveIndex(clampedIndex, event.key === "ArrowDown" ? 1 : -1, results.length));
      return;
    }
    if (event.key === "Enter") {
      const result = results[clampedIndex];
      if (result != null) {
        event.preventDefault();
        activate(result);
      }
      return;
    }
    const isMod = bridge.platform === "darwin" ? event.metaKey : event.ctrlKey;
    if (isMod && /^[1-9]$/.test(event.key)) {
      const result = results[Number(event.key) - 1];
      if (result != null) {
        event.preventDefault();
        activate(result);
      }
    }
  }

  return createPortal(
    <div
      className={styles["hb-palette-scrim"]}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onKeyDown={onPaletteKeyDown}
    >
      <div ref={panelRef} role="dialog" aria-label={t("palette.ariaLabel")} className={styles["hb-palette"]}>
        <div className={styles["hb-palette-input-row"]}>
          <Search size={18} />
          <input
            autoFocus
            className={styles["hb-palette-input"]}
            placeholder={t("palette.placeholder")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
          />
        </div>

        <div role="tablist" className={styles["hb-palette-tabs"]} aria-label={t("palette.ariaLabel")}>
          {tabs.map((tabId) => (
            <button
              key={tabId}
              type="button"
              role="tab"
              aria-selected={tabId === activeTab}
              className={`${styles["hb-palette-tab"]} ${tabId === activeTab ? styles["hb-palette-tab--active"] : ""}`}
              onClick={() => {
                setActiveTab(tabId);
                setSelectedIndex(0);
              }}
            >
              {t(`palette.tab.${tabId}`)}
            </button>
          ))}
        </div>

        <div className={styles["hb-palette-results"]} role="listbox" aria-label={t("palette.ariaLabel")}>
          {results.length === 0 ? (
            <div className={styles["hb-palette-empty"]}>{t(query.trim().length === 0 ? "palette.empty" : "palette.noResults")}</div>
          ) : (
            results.map((result, index) => (
              <PaletteResultRow
                key={resultKey(result)}
                result={result}
                query={query}
                selected={index === clampedIndex}
                shortcutDigit={index < 9 ? index + 1 : null}
                nowMs={nowMs}
                onActivate={() => activate(result)}
              />
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function resultKey(result: PaletteResult): string {
  if (result.kind === "chat") return `chat:${result.chat.id}`;
  if (result.kind === "message") return `message:${result.hit.entryId}`;
  return `action:${result.action.id}`;
}
