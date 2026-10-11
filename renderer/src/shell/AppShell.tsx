import { useActiveChat } from "../data/hooks/useActiveChat.ts";
import { ComposerSlot } from "../features/composer/ComposerSlot.tsx";
import { HeaderSlot } from "../features/conversation/HeaderSlot.tsx";
import { TranscriptSlot } from "../features/conversation/TranscriptSlot.tsx";
import { BotOnboardingBanner } from "../features/dialogs/BotOnboardingBanner.tsx";
import { DialogsPanelSync } from "../features/dialogs/DialogsPanelSync.tsx";
import { useMainColumnOverride } from "../features/dialogs/useMainColumnOverride.tsx";
import { SidebarSlot } from "../features/sidebar/SidebarSlot.tsx";
import { useT } from "../i18n/TranslationProvider.tsx";
import { PanelHost } from "./PanelHost.tsx";
import { useSidebarLayout } from "./useSidebarLayout.ts";
import styles from "./AppShell.module.css";

/**
 * The window layout: resizable sidebar (collapsing to an icon rail), main column with
 * header/transcript/composer slots, and an optional right-side info panel. This file
 * is the one place that composes feature slots together -- a feature should never need to edit it to add
 * a dialog (use `DialogHost`/`PanelHost`), a shortcut (`useShortcut`), or an i18n key (its own
 * `i18n.ts`).
 */
export function AppShell() {
  const sidebar = useSidebarLayout();
  const { activeChatId } = useActiveChat();
  const { t } = useT();
  const mainOverride = useMainColumnOverride();

  return (
    <div className={styles["hb-shell"]}>
      <div className={styles["hb-shell-row"]}>
        <div className={styles["hb-shell-sidebar"]} style={{ width: sidebar.width }}>
          <SidebarSlot mode={sidebar.mode} />
          {/* Mounted in both modes -- the drag handle works in both directions: dragging it out
              from the collapsed rail past the snap threshold (sidebar-width.ts's `resolveSidebarDrag`,
              stateless, so it doesn't matter which mode the drag started in) expands back to a labeled
              sidebar, not just ⌘B. */}
          <div
            className={styles["hb-shell-resize-handle"]}
            onPointerDown={(event) => {
              const row = event.currentTarget.parentElement?.parentElement;
              const startLeft = row?.getBoundingClientRect().left ?? 0;
              const target = event.currentTarget;
              target.setPointerCapture(event.pointerId);
              function onMove(moveEvent: PointerEvent) {
                sidebar.onDrag(moveEvent.clientX - startLeft);
              }
              function onUp() {
                sidebar.onDragEnd();
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
              }
              window.addEventListener("pointermove", onMove);
              window.addEventListener("pointerup", onUp);
            }}
          />
        </div>

        <PanelHost>
          <DialogsPanelSync />
          <div className={styles["hb-shell-main"]} aria-label={t("shell.main.ariaLabel")}>
            {mainOverride != null ? (
              mainOverride
            ) : activeChatId == null ? (
              <div className={styles["hb-shell-empty"]}>
                <div className={styles["hb-shell-empty-title"]}>{t("shell.emptyState.title")}</div>
                <div className={styles["hb-shell-empty-body"]}>{t("shell.emptyState.body")}</div>
              </div>
            ) : (
              <>
                <BotOnboardingBanner chatId={activeChatId} />
                <HeaderSlot chatId={activeChatId} />
                <TranscriptSlot chatId={activeChatId} />
                <ComposerSlot chatId={activeChatId} />
              </>
            )}
          </div>
        </PanelHost>
      </div>
    </div>
  );
}
