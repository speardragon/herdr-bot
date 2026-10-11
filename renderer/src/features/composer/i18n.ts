/** Composer's catalog fragment. */
export const en = {
  "composer.placeholder.bot": "Message {chatName}",
  "composer.placeholder.room": "Message {chatName}",
  "composer.attach": "Attach a file",
  "composer.send": "Send",
  "composer.input.ariaLabel": "Message input",
  "composer.attachment.error.empty": "That file is empty.",
  "composer.attachment.error.tooLarge": "Files must be smaller than 25MB.",
  "composer.attachment.error.failed": "Couldn't attach that file.",
  "composer.attachment.remove": "Remove {filename}",
  "composer.reply.label": "Replying to {authorName}",
  "composer.reply.clear": "Cancel reply",
  "composer.send.error": "Couldn't send that message.",
} as const;

export const ko = {
  // Korean particle rule: a bot is addressed like a person (dative 에게), a room like a place you
  // post into (locative 에). See placeholder.ts.
  "composer.placeholder.bot": "{chatName}에게 메시지 보내기",
  "composer.placeholder.room": "{chatName}에 메시지 보내기",
  "composer.attach": "파일 첨부",
  "composer.send": "보내기",
  "composer.input.ariaLabel": "메시지 입력창",
  "composer.attachment.error.empty": "빈 파일은 첨부할 수 없어요.",
  "composer.attachment.error.tooLarge": "파일은 25MB보다 작아야 해요.",
  "composer.attachment.error.failed": "파일을 첨부하지 못했어요.",
  "composer.attachment.remove": "{filename} 삭제",
  "composer.reply.label": "{authorName}님에게 답장",
  "composer.reply.clear": "답장 취소",
  "composer.send.error": "메시지를 보내지 못했어요.",
} satisfies Record<keyof typeof en, string>;
