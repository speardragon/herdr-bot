import { Plus, Search, Settings } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useActiveChat } from "../../data/hooks/useActiveChat.ts";
import { useChats } from "../../data/hooks/useChats.ts";
import { usePins } from "../../data/hooks/usePins.ts";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { Avatar } from "../../primitives/index.ts";
import type { SidebarMode } from "../../shell/sidebar-width.ts";
import { useDialogs } from "../dialogs/useDialogs.tsx";
import { requestPaletteOpen } from "../palette/palette-bus.ts";
import { moveIndex } from "./list-nav.ts";
import { orderChats, visibleChats } from "./order-chats.ts";
import { SidebarRow } from "./SidebarRow.tsx";
import styles from "./SidebarSlot.module.css";

export interface SidebarSlotProps {
  readonly mode: SidebarMode;
}

/**
 * The sidebar's chat list, search entry point, new-chat entry point, and settings entry point.
 * `mode` is shell-owned (see `shell/useSidebarLayout.ts`) -- this only renders
 * differently per mode, it never duplicates the resize/rail-snap/⌘B logic that already lives there.
 */
export function SidebarSlot({ mode }: SidebarSlotProps) {
  const { t, locale } = useT();
  const dialogs = useDialogs();
  const chats = useChats();
  const { activeChatId, setActiveChatId } = useActiveChat();
  const pins = usePins();
  const rail = mode === "rail";

  const visible = visibleChats(chats, activeChatId);
  const { pinned, rest } = orderChats(visible, pins.pinnedChatIds);
  // Genuinely no chats at all (onboarding state) -- not "every chat happens to be hidden right now",
  // which should still show the (empty) list chrome rather than the "create your first bot" prompt.
  const isEmpty = chats.length === 0;

  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]')];
    if (items.length === 0) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : moveIndex(currentIndex, event.key === "ArrowDown" ? 1 : -1, items.length);
    items[nextIndex]?.focus();
  }

  return (
    <nav className={`${styles["hb-sidebar"]} ${rail ? styles["hb-sidebar--rail"] : ""}`} aria-label={t("shell.sidebar.ariaLabel")}>
      <div className={`${styles["hb-sidebar-header"]} hb-drag`}>
        {!rail && (
          <button type="button" className="hb-no-drag" title={t("sidebar.newChat")} aria-label={t("sidebar.newChat")} onClick={() => dialogs.openNewChatMenu()}>
            <Plus size={20} />
          </button>
        )}
      </div>

      {isEmpty ? (
        <div className={styles["hb-sidebar-list"]}>
          <button type="button" className={`${styles["hb-sidebar-row"]} hb-no-drag`} onClick={() => dialogs.openNewChatMenu()}>
            <Avatar kind="user" label="+" size="md" />
            <div className={styles["hb-sidebar-row-main"]}>
              <div className={styles["hb-sidebar-row-name"]}>{t("sidebar.createFirstBot")}</div>
            </div>
          </button>
        </div>
      ) : (
        <>
          {!rail && (
            <button type="button" className={`${styles["hb-sidebar-search"]} hb-no-drag`} onClick={() => requestPaletteOpen()}>
              <Search size={14} />
              <span>{t("sidebar.search")}</span>
            </button>
          )}

          <div className={styles["hb-sidebar-list"]} role="listbox" aria-label={t("shell.sidebar.ariaLabel")} onKeyDown={onListKeyDown}>
            {!rail && pinned.length > 0 && <div className={styles["hb-sidebar-section-label"]}>{t("sidebar.pinnedSectionLabel")}</div>}
            {pinned.map((chat) => (
              <SidebarRow
                key={chat.id}
                chat={chat}
                rail={rail}
                locale={locale}
                selected={chat.id === activeChatId}
                isPinned
                onSelect={() => setActiveChatId(chat.id)}
                onTogglePin={() => pins.togglePin(chat.id)}
              />
            ))}
            {rest.map((chat) => (
              <SidebarRow
                key={chat.id}
                chat={chat}
                rail={rail}
                locale={locale}
                selected={chat.id === activeChatId}
                isPinned={false}
                onSelect={() => setActiveChatId(chat.id)}
                onTogglePin={() => pins.togglePin(chat.id)}
              />
            ))}
          </div>
        </>
      )}

      <div className={styles["hb-sidebar-footer"]}>
        {rail ? (
          <div className={styles["hb-sidebar-rail-footer"]}>
            <button
              type="button"
              className={`${styles["hb-sidebar-rail-footer-button"]} hb-no-drag`}
              aria-label={t("sidebar.newChat")}
              title={t("sidebar.newChat")}
              onClick={() => dialogs.openNewChatMenu()}
            >
              <Plus size={18} />
            </button>
            <button
              type="button"
              className={`${styles["hb-sidebar-rail-footer-button"]} hb-no-drag`}
              aria-label={t("sidebar.settings")}
              title={t("sidebar.settings")}
              onClick={() => dialogs.openSettings()}
            >
              <Settings size={16} />
            </button>
          </div>
        ) : (
          <button type="button" className={`${styles["hb-sidebar-footer-button"]} hb-no-drag`} aria-label={t("sidebar.settings")} onClick={() => dialogs.openSettings()}>
            <Settings size={16} />
            <span>{t("sidebar.settings")}</span>
          </button>
        )}
      </div>
    </nav>
  );
}
