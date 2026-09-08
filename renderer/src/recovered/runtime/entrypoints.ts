export type RecoveredSurface = "overlay" | "workspace";
export type RecoveryLevel = "exact-placeholder" | "semantic-model" | "named-upstream-module";

export interface RecoveredEntrypoint {
  id: string;
  name: string;
  surface: RecoveredSurface;
  originalEntrypointPath: string;
  originalViewPath: string;
  productionChunk: string;
  recovery: RecoveryLevel;
}

export const recoveredEntrypoints = [
  {
    id: "overlay:computer",
    name: "Computer",
    surface: "overlay",
    originalEntrypointPath: "features/computer/overlay/entrypoint.ts",
    originalViewPath: "features/computer/overlay/view.tsx",
    productionChunk: "view-ChG-6rmU.js",
    recovery: "exact-placeholder"
  },
  {
    id: "overlay:hidden-chats",
    name: "Hidden Chats",
    surface: "overlay",
    originalEntrypointPath: "features/hidden-chats/overlay/entrypoint.ts",
    originalViewPath: "features/hidden-chats/overlay/view.tsx",
    productionChunk: "view-Cbx1-ckK.js",
    recovery: "semantic-model"
  },
  {
    id: "view:org-chart",
    name: "Org Chart",
    surface: "workspace",
    originalEntrypointPath: "features/org-chart/workspace/entrypoint.ts",
    originalViewPath: "features/org-chart/workspace/view.tsx",
    productionChunk: "view-D0otXpJy.js",
    recovery: "semantic-model"
  },
  {
    id: "overlay:plugins",
    name: "Plugins",
    surface: "overlay",
    originalEntrypointPath: "features/plugins/overlay/entrypoint.ts",
    originalViewPath: "features/plugins/overlay/view.tsx",
    productionChunk: "view-B5Ug8wEm.js",
    recovery: "semantic-model"
  },
  {
    id: "overlay:settings",
    name: "Settings",
    surface: "overlay",
    originalEntrypointPath: "features/settings/overlay/entrypoint.ts",
    originalViewPath: "features/settings/overlay/view.tsx",
    productionChunk: "view-BRftG-LF.js",
    recovery: "named-upstream-module"
  }
] as const satisfies readonly RecoveredEntrypoint[];
