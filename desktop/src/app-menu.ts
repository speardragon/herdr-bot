/**
 * The native menu bar. Setting a menu replaces Electron's default one entirely, so this keeps every
 * standard menu (Edit carries copy/paste/select-all for the renderer, View the zoom keys) and adds
 * "Check for Updates…" to the app menu, under About, where macOS apps put it.
 *
 * The labels and the update dialogs' text follow the app's language setting (Korean or English).
 */
import type { MenuItemConstructorOptions } from "electron";

export type MenuLanguage = "ko" | "en";

/** The app's language setting, or the system's when it has none. */
export function menuLanguage(preference: string | null, systemLocale: string): MenuLanguage {
  const locale = preference ?? systemLocale;
  return locale.toLowerCase().startsWith("ko") ? "ko" : "en";
}

const TEXT = {
  en: {
    checkForUpdates: "Check for Updates…",
    upToDate: (version: string) => `herdr-bot ${version} is the latest version.`,
    checkFailed: "Could not check for updates.",
    available: (version: string) => `herdr-bot ${version} is available.`,
    availableDetail: (current: string) => `You have ${current}.\nThe update is downloaded and checked, then herdr-bot restarts. Your bots and chats stay as they are.`,
    updateNow: "Update and Restart",
    later: "Later",
    releaseNotes: "Release Notes",
    downloading: "The update is already downloading.",
    installFailed: "The update could not be installed.",
    ok: "OK",
  },
  ko: {
    checkForUpdates: "업데이트 확인…",
    upToDate: (version: string) => `최신 버전을 쓰고 있어요 (${version}).`,
    checkFailed: "업데이트를 확인하지 못했어요.",
    available: (version: string) => `새 버전이 나왔어요: herdr-bot ${version}`,
    availableDetail: (current: string) => `지금 쓰는 버전: ${current}\n업데이트를 내려받아 확인한 뒤 앱이 다시 시작돼요. 봇과 대화는 그대로 남아요.`,
    updateNow: "업데이트 후 재시작",
    later: "나중에",
    releaseNotes: "릴리스 노트",
    downloading: "업데이트를 이미 내려받는 중이에요.",
    installFailed: "업데이트를 설치하지 못했어요.",
    ok: "확인",
  },
} as const;

export type UpdateText = (typeof TEXT)[MenuLanguage];

export function updateText(language: MenuLanguage): UpdateText {
  return TEXT[language];
}

export function appMenuTemplate(appName: string, language: MenuLanguage, onCheckForUpdates: () => void): MenuItemConstructorOptions[] {
  return [
    {
      label: appName,
      submenu: [
        { role: "about" },
        { label: TEXT[language].checkForUpdates, click: onCheckForUpdates },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];
}
