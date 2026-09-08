import { useId, useState, type FormEvent } from "react";
import type { SlackDraft } from "../protocol";
import { SandIcon } from "../../../../../ui/sand-kit-primitives";
import { projectLeafEntry, visualLineCount, boundedFirstLine, type TranscriptCardLeafProps } from "./shared";

// @evidence src/app/dist/renderer/assets/view-DyaeCHiE.js#byteOffset=0 (Slack-draft card leaf)
// @evidence src/app/dist/renderer/assets/view-DyaeCHiE.js#byteOffset=800 (Slack validation, collapse, status, and presentation lifecycle)
// @evidence src/app/dist/renderer/assets/view-DyaeCHiE.js#byteOffset=9687 (shipped empty send/discard callbacks)

function SlackSent({ draft, titleId }: { draft: SlackDraft; titleId: string }) {
  return <section aria-labelledby={titleId} className="sand-slack-composer" role="region"><div><SandIcon name="logo-slack" /><span id={titleId}>Slack message</span><span>Sent</span></div><span>Sent to {draft.target} — “{boundedFirstLine(draft.body)}”</span></section>;
}

export function SlackDraftTranscriptCard(props: TranscriptCardLeafProps) {
  const entry = projectLeafEntry(props.entry);
  const draft = entry?.message.type === "slack-draft" ? entry.message.draft : null;
  const initialDraft = draft ?? { target: "", body: "" };
  const [body, setBody] = useState(initialDraft.body);
  const [expanded, setExpanded] = useState(false);
  const titleId = useId();
  if (entry == null || entry.message.type !== "slack-draft" || draft == null) return null;
  const status = entry.draftSendState ?? "editable";
  const valid = status === "editable" && body.trim().length > 0;
  const collapsed = visualLineCount(body) > 8 && !expanded;
  const disabled = status !== "editable";
  const submit = (event: FormEvent<HTMLFormElement>) => event.preventDefault();
  if (status === "sent") return <SlackSent draft={draft} titleId={titleId} />;
  return <form aria-labelledby={titleId} className="sand-slack-composer" onSubmit={submit}>
    <div><h3 id={titleId}><SandIcon name="logo-slack" />Slack message</h3>{status === "sending" ? <span role="status">Sending…</span> : <span role="status">Ready to send</span>}</div>
    {draft.workspace == null ? null : <div><span>Workspace</span><span>{draft.workspace}</span></div>}
    <div><span>To</span><span>{draft.target}</span></div>
    <div><span>Thread</span><span>{draft.thread == null ? "New message" : `Reply in “${draft.thread}”`}</span></div>
    <div>{collapsed ? <><p>{body}</p><span aria-hidden="true" /></> : <textarea aria-label="Message" autoComplete="off" className="sand-slack-composer__body" disabled={disabled} onChange={(event) => setBody(event.currentTarget.value)} placeholder="Write a message" rows={4} spellCheck value={body} />}</div>
    {status === "editable" && visualLineCount(body) > 8 ? <button onClick={() => setExpanded((value) => !value)} type="button">{expanded ? "Show less" : "Show more"}<span aria-hidden="true">⌄</span></button> : null}
    <div><button disabled={!valid} type="submit">Send message</button><button disabled={disabled} onClick={(event) => event.preventDefault()} type="button">Discard</button></div>
  </form>;
}

export default SlackDraftTranscriptCard;
