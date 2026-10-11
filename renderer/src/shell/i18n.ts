/** Shell-owned copy: the app-level empty state and anything chrome that isn't any one feature slice's
 * responsibility. Keep this file small -- most UI text belongs to the feature that renders it. */
export const en = {
  "shell.emptyState.title": "Select a chat",
  "shell.emptyState.body": "Pick a bot or room from the sidebar, or start something new.",
  "shell.sidebar.ariaLabel": "Chat list",
  "shell.main.ariaLabel": "Conversation",
} as const;

export const ko = {
  "shell.emptyState.title": "채팅을 선택하세요",
  "shell.emptyState.body": "사이드바에서 봇이나 방을 선택하거나 새로 시작해 보세요.",
  "shell.sidebar.ariaLabel": "채팅 목록",
  "shell.main.ariaLabel": "대화",
} satisfies Record<keyof typeof en, string>;
