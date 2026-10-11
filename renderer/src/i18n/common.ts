/** Words reused across many dialogs/panels. Feature-specific copy belongs in that
 * feature's own `i18n.ts`, not here -- this file is only for genuinely cross-cutting vocabulary. */
export const en = {
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.delete": "Delete",
  "common.choose": "Choose…",
  "common.save": "Save",
  "common.back": "Back",
  "common.optional": "optional",
  "common.me": "Me",
} as const;

export const ko = {
  "common.cancel": "취소",
  "common.close": "닫기",
  "common.delete": "삭제",
  "common.choose": "선택…",
  "common.save": "저장",
  "common.back": "뒤로",
  "common.optional": "선택",
  "common.me": "나",
} satisfies Record<keyof typeof en, string>;
