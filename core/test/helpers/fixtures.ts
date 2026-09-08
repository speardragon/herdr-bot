import type { BotProfile } from "../../src/store/profile-store.ts";
import type { RoomConfig } from "../../src/store/room-store.ts";

export function sampleProfile(overrides: Partial<BotProfile> = {}): BotProfile {
  return {
    id: "reviewer",
    name: "Reviewer",
    description: "reviews diffs",
    kind: "claude",
    cwd: "/tmp/repo",
    permissionMode: "ask",
    avatarShape: null,
    avatarColor: null,
    adopted: false,
    herdr: { paneId: "w1:p2", workspaceId: "w1", sessionId: null },
    notifyOnUpdatesEnabled: true,
    isHiddenFromSidebar: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

export function sampleRoom(overrides: Partial<RoomConfig> = {}): RoomConfig {
  return {
    id: "room-auth-1a2b",
    name: "auth",
    description: "",
    memberIds: ["reviewer", "fixer"],
    isHiddenFromSidebar: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}
