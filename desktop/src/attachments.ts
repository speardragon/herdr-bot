import type { BrowserWindow, Dialog } from "electron";

export interface AttachmentService {
  readonly handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown> | unknown>;
}

export interface AttachmentServiceDeps {
  readonly dialog: Dialog;
  readonly window: BrowserWindow;
  readonly userDataDir: string;
}

export function createAttachmentService(_deps: AttachmentServiceDeps): AttachmentService {
  return {
    handlers: {
      resolveAttachmentMedia: () => null,
      readAttachmentText: () => null,
      readAttachmentBytes: () => null,
      downloadAttachment: () => false,
      stageAttachmentBytes: () => ({ ok: false, reason: "failed" }),
      commitStagedAttachments: () => null,
      discardStagedAttachment: () => undefined,
      pickAvatarFile: () => null,
    },
  };
}
