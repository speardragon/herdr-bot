import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useActiveChat } from "../../data/hooks/useActiveChat.ts";
import { useChats } from "../../data/hooks/useChats.ts";
import { dialogsStore } from "./dialogs-store.ts";
import { NewChatMenu } from "./NewChatMenu.tsx";
import { OnboardingEmptyState } from "./OnboardingEmptyState.tsx";

/**
 * Decides whether the main column's own content (the shell's default empty state, or the active chat)
 * should be replaced -- the one additive hook `shell/AppShell.tsx` calls. Two cases, both of which
 * render directly in the main column rather than a modal: the "+" quick-create landing and the
 * zero-bots onboarding card. `null` means "render your own content as usual".
 *
 * The onboarding card only takes over when nothing *real* is actively open: deleting the last bot while
 * a room is the active chat must not yank that room out from under the user -- the room (now memberless,
 * or still with other room-only members) stays visible, header/transcript/composer and all. A literal
 * "no bots exist anywhere" reading would hide an open room the moment its last bot disappears, which
 * reads as the app losing the user's place rather than guiding first-time setup.
 *
 * "Actively open" checks that `activeChatId` still resolves to a chat in the current list, not just that
 * it's non-null -- a stale id (the active chat got deleted out from under the user some other way, e.g.
 * from the CLI, or a leftover id from a previous session) must still fall through to onboarding/the
 * shell's own empty state rather than rendering a header/transcript/composer for a chat that no longer
 * exists (`useChat(id)` returns `null` for those, and the main column's slots all render nothing for a
 * null chat -- a blank column, not a helpful one).
 */
export function useMainColumnOverride(): ReactNode | null {
  const newMenuOpen = useSyncExternalStore(dialogsStore.subscribe, () => dialogsStore.getState().newMenuOpen);
  const chats = useChats();
  const { activeChatId } = useActiveChat();
  const activeChatExists = activeChatId != null && chats.some((chat) => chat.id === activeChatId);

  if (newMenuOpen) return <NewChatMenu />;
  if (!activeChatExists && !chats.some((chat) => chat.kind === "bot")) return <OnboardingEmptyState />;
  return null;
}
