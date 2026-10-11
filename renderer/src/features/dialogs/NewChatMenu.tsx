import { useEffect, useRef, useState } from "react";
import { Plus, SlidersHorizontal, Users, X } from "lucide-react";
import { useActiveChat } from "../../data/hooks/useActiveChat.ts";
import { useChats } from "../../data/hooks/useChats.ts";
import { resolvePersonaColor } from "../../data/avatar-colors.ts";
import { useDialogHost } from "../../shell/DialogHost.tsx";
import { useShortcut } from "../../shell/ShortcutsProvider.tsx";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { Avatar, IconButton, Kbd } from "../../primitives/index.ts";
import { closeNewMenu } from "./dialogs-store.ts";
import { NewDialog } from "./NewDialog.tsx";
import { QuickCreateBot } from "./QuickCreateBot.tsx";
import styles from "./NewChatMenu.module.css";

/**
 * The sidebar "+" quick-create landing: replaces the main content column in-place -- it's
 * not a modal. Rendered by `useMainColumnOverride()` while `dialogs-store`'s `newMenuOpen` is true.
 * "Create a new Bot" swaps this same main-column slot for the shared `QuickCreateBot` flow; "Create a
 * group chat"/"Advanced setup" close this view and open the real `NewDialog` modal (the only room/full
 * bot form this app has).
 *
 * Since this view isn't a modal, `DialogHost`'s own Escape/scrim-click handling never applies to it, so
 * it needs its own two dismiss paths: the "X" button next to the "To:" row, and picking a different chat
 * from the sidebar/palette while this is open -- without either, `newMenuOpen` would stay true forever
 * (checked first in `useMainColumnOverride`), so the chat you just clicked would never appear until you
 * picked one of this view's own rows.
 */
export function NewChatMenu() {
  const [view, setView] = useState<"menu" | "quick-bot">("menu");
  const chats = useChats();
  const { activeChatId, setActiveChatId } = useActiveChat();
  const dialogHost = useDialogHost();
  const { t } = useT();

  const initialChatIdRef = useRef(activeChatId);
  useEffect(() => {
    if (activeChatId !== initialChatIdRef.current) closeNewMenu();
  }, [activeChatId]);

  useShortcut("dialogs.newMenu.escape", "escape", () => closeNewMenu());

  const bots = chats.filter((chat) => chat.kind === "bot").slice(0, 6);

  function openAdvanced(initialTab: "bot" | "room") {
    closeNewMenu();
    dialogHost.open(<NewDialog initialTab={initialTab} />, { titleKey: "dialogs.new.title" });
  }

  function openBot(chatId: string) {
    setActiveChatId(chatId);
    closeNewMenu();
  }

  useShortcut("dialogs.newMenu.1", "mod+1", () => (view === "menu" ? setView("quick-bot") : undefined));
  useShortcut("dialogs.newMenu.2", "mod+2", () => (view === "menu" ? openAdvanced("room") : undefined));
  useShortcut("dialogs.newMenu.3", "mod+3", () => (view === "menu" ? openAdvanced("bot") : undefined));
  useShortcut("dialogs.newMenu.4", "mod+4", () => (view === "menu" && bots[0] != null ? openBot(bots[0].id) : undefined));
  useShortcut("dialogs.newMenu.5", "mod+5", () => (view === "menu" && bots[1] != null ? openBot(bots[1].id) : undefined));
  useShortcut("dialogs.newMenu.6", "mod+6", () => (view === "menu" && bots[2] != null ? openBot(bots[2].id) : undefined));
  useShortcut("dialogs.newMenu.7", "mod+7", () => (view === "menu" && bots[3] != null ? openBot(bots[3].id) : undefined));
  useShortcut("dialogs.newMenu.8", "mod+8", () => (view === "menu" && bots[4] != null ? openBot(bots[4].id) : undefined));
  useShortcut("dialogs.newMenu.9", "mod+9", () => (view === "menu" && bots[5] != null ? openBot(bots[5].id) : undefined));

  if (view === "quick-bot") {
    return <QuickCreateBot onAdvanced={() => openAdvanced("bot")} onDone={() => closeNewMenu()} />;
  }

  return (
    <div>
      <div className={styles["hb-new-menu-header"]}>
        <span>{t("dialogs.newMenu.to")}</span>
        <span className={styles["hb-new-menu-placeholder"]}>{t("dialogs.newMenu.searchPlaceholder")}</span>
        <IconButton size="sm" aria-label={t("common.close")} onClick={() => closeNewMenu()}>
          <X size={16} />
        </IconButton>
      </div>
      <div className={styles["hb-new-menu-list"]}>
        <button type="button" className={styles["hb-new-menu-row"]} onClick={() => setView("quick-bot")}>
          <span className={styles["hb-new-menu-icon"]}>
            <Plus size={16} />
          </span>
          <span className={styles["hb-new-menu-label"]}>{t("dialogs.newMenu.createBot")}</span>
          <span className={styles["hb-new-menu-kbd"]}>
            <Kbd>⌘</Kbd>
            <Kbd>1</Kbd>
          </span>
        </button>
        <button type="button" className={styles["hb-new-menu-row"]} onClick={() => openAdvanced("room")}>
          <span className={styles["hb-new-menu-icon"]}>
            <Users size={16} />
          </span>
          <span className={styles["hb-new-menu-label"]}>{t("dialogs.newMenu.createRoom")}</span>
          <span className={styles["hb-new-menu-kbd"]}>
            <Kbd>⌘</Kbd>
            <Kbd>2</Kbd>
          </span>
        </button>
        <button type="button" className={styles["hb-new-menu-row"]} onClick={() => openAdvanced("bot")}>
          <span className={styles["hb-new-menu-icon"]}>
            <SlidersHorizontal size={16} />
          </span>
          <span className={styles["hb-new-menu-label"]}>{t("dialogs.newMenu.advanced")}</span>
          <span className={styles["hb-new-menu-kbd"]}>
            <Kbd>⌘</Kbd>
            <Kbd>3</Kbd>
          </span>
        </button>
        {bots.map((bot, index) => (
          <button key={bot.id} type="button" className={styles["hb-new-menu-row"]} onClick={() => openBot(bot.id)}>
            <Avatar kind="bot" color={resolvePersonaColor(bot.avatarColor)} name={bot.name} size="sm" />
            <span className={styles["hb-new-menu-label"]}>{bot.name}</span>
            <span className={styles["hb-new-menu-kbd"]}>
              <Kbd>⌘</Kbd>
              <Kbd>{String(index + 4)}</Kbd>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
