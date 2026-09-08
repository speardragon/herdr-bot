import { AssistantMessageContent } from "../../../workspace/transcript";
import { classifySendMessageTextUrl } from "../send-message-text";
import { projectLeafEntry, useTranscriptCardLeafProviders, type TranscriptCardLeafProps } from "./shared";
import LinkCardView from "./link-card";

// @evidence src/app/dist/renderer/assets/view-BuhxMXKm.js#byteOffset=0 (send-message:text lazy leaf)
// @evidence src/app/dist/renderer/assets/view-BuhxMXKm.js#byteOffset=267 (content/images/streaming projection)
// @evidence src/app/dist/renderer/assets/view-BuhxMXKm.js#byteOffset=510 (ordinary message projection)
// @evidence src/app/dist/renderer/assets/view-BuhxMXKm.js#byteOffset=732 (URL-card fallback and trusted source)
// @evidence recovered/frontend/app/assets/view-BuhxMXKm.js#byteOffset=172 (Windows content/images/streaming projection)
// @evidence recovered/frontend/app/assets/view-BuhxMXKm.js#byteOffset=390 (Windows URL-card fallback)
// @evidence recovered/frontend/app/assets/view-BuhxMXKm.js#byteOffset=1210 (Windows trusted ordinary projection)

export function SendMessageTextTranscriptCard(props: TranscriptCardLeafProps) {
  const entry = projectLeafEntry(props.entry);
  const providers = useTranscriptCardLeafProviders();
  if (entry == null || entry.message.type !== "text") return null;

  const message = entry.message;
  const streaming = entry.streaming === true;
  const url = classifySendMessageTextUrl({
    kind: "send-message",
    id: entry.id,
    message,
    ...(streaming ? { streaming } : {}),
  });
  if (url != null && providers?.urlCards != null) {
    return <LinkCardView isGroupStart={props.adjacency?.isGroupStart} provider={providers.urlCards} url={url} whenUnavailable="url-card" />;
  }

  return <div aria-label="Agent message" className="sand-message" data-group-start={props.adjacency?.isGroupStart || undefined} data-role="assistant" role="group">
    <AssistantMessageContent
      channel={message.channel}
      images={message.images}
      isSourceTrusted={true}
      isStreaming={streaming}
      text={message.content}
    />
  </div>;
}

export default SendMessageTextTranscriptCard;
