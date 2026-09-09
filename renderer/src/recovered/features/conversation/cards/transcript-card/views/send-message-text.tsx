import { AssistantMessageContent } from "../../../workspace/transcript";
import { AgentAvatar } from "../../../workspace/agent-avatar";
import { resolvePersonaColorHex } from "../../../../onboarding/signed-in/character";
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

  const author = entry.author;
  // herdr-bot: a room message names a specific member; a 1:1 DM's author is the chat's own agent,
  // so it stays unlabelled (the header already says who this is). Only the first bubble of a
  // sender's run gets the avatar/name -- adjacency is optional in some read-only render paths, so
  // default to showing it there too.
  const isRoomMessage = author != null && providers?.scope.agentId != null && author.id !== providers.scope.agentId;
  const isGroupStart = props.adjacency?.isGroupStart ?? true;
  const bubble = <div aria-label="Agent message" className="sand-message" data-group-start={isGroupStart || undefined} data-role="assistant" role="group">
    <AssistantMessageContent
      channel={message.channel}
      images={message.images}
      isSourceTrusted={true}
      isStreaming={streaming}
      text={message.content}
    />
  </div>;
  if (!isRoomMessage) return bubble;

  // herdr-bot: Slack-style run -- the name labels the first bubble, the avatar anchors the last
  // (and sits at the bottom of it), silence stays on the same author, and each bot's own colour
  // ties the two together.
  const isRunEnd = props.adjacency?.isAssistantRunEnd ?? true;
  const avatar = providers?.authorAvatar?.(author.id) ?? null;
  return <div className="sand-room-message" data-group-start={isGroupStart || undefined} data-run-end={isRunEnd || undefined}>
    <div className="sand-room-message__gutter">
      {isRunEnd ? <AgentAvatar agentId={author.id} color={avatar?.avatarColor} dataUrl={avatar?.avatarDataUrl} name={author.name} shape={avatar?.avatarShape} size="sm" /> : null}
    </div>
    <div className="sand-room-message__content">
      {isGroupStart ? <span className="sand-message__author" data-author-id={author.id} style={{ color: resolvePersonaColorHex(author.id, avatar?.avatarColor) }}>{author.name}</span> : null}
      {bubble}
    </div>
  </div>;
}

export default SendMessageTextTranscriptCard;
