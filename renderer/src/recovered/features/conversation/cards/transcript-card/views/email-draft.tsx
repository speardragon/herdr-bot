import { useId, useState, type FormEvent } from "react";
import type { EmailDraft } from "../protocol";
import { projectLeafEntry, visualLineCount, type TranscriptCardLeafProps } from "./shared";

// @evidence src/app/dist/renderer/assets/view-ClhdNXKM.js#byteOffset=0 (email-draft card leaf)
// @evidence src/app/dist/renderer/assets/view-ClhdNXKM.js#byteOffset=838 (email validation, collapse, status, and presentation lifecycle)
// @evidence src/app/dist/renderer/assets/view-ClhdNXKM.js#byteOffset=10227 (shipped empty send/discard callbacks)

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function parseRecipients(value: string): string[] {
  return value.split(",").map((recipient) => recipient.trim()).filter((recipient) => recipient.length > 0);
}

function EmailSent({ draft, titleId }: { draft: EmailDraft; titleId: string }) {
  return <section aria-labelledby={titleId} className="sand-email-composer" role="region"><div><span aria-hidden="true" /> <span id={titleId}>New email</span><span>Sent</span></div><span>Sent to {draft.to[0] ?? ""} — “{draft.subject}”</span></section>;
}

export function EmailDraftTranscriptCard(props: TranscriptCardLeafProps) {
  const entry = projectLeafEntry(props.entry);
  const draft = entry?.message.type === "email-draft" ? entry.message.draft : null;
  const initialDraft = draft ?? { to: [], subject: "", body: "" };
  const [recipientsValue, setRecipientsValue] = useState(initialDraft.to.join(", "));
  const [subject, setSubject] = useState(initialDraft.subject);
  const [body, setBody] = useState(initialDraft.body);
  const [expanded, setExpanded] = useState(false);
  const titleId = useId();
  if (entry == null || entry.message.type !== "email-draft" || draft == null) return null;
  const status = entry.draftSendState ?? "editable";
  const recipients = parseRecipients(recipientsValue);
  const valid = status === "editable" && recipients.length > 0 && recipients.every((recipient) => emailPattern.test(recipient)) && body.trim().length > 0;
  const collapsed = visualLineCount(body) > 8 && !expanded;
  const disabled = status !== "editable";
  const submit = (event: FormEvent<HTMLFormElement>) => event.preventDefault();
  if (status === "sent") return <EmailSent draft={draft} titleId={titleId} />;
  return <form aria-labelledby={titleId} className="sand-email-composer" onSubmit={submit}>
    <div><h3 id={titleId}>New email</h3>{status === "sending" ? <span role="status">Sending…</span> : <span role="status">Ready to send</span>}</div>
    {draft.from == null ? null : <div><span>From</span><span>{draft.from}</span></div>}
    <label><span>To</span><input autoComplete="off" className="sand-email-composer__input" disabled={disabled} onChange={(event) => setRecipientsValue(event.currentTarget.value)} placeholder="name@example.com" spellCheck={false} type="text" value={recipientsValue} /></label>
    <label><span>Subject</span><input autoComplete="off" className="sand-email-composer__input" disabled={disabled} onChange={(event) => setSubject(event.currentTarget.value)} placeholder="Subject" spellCheck type="text" value={subject} /></label>
    <div>{collapsed ? <><p>{body}</p><span aria-hidden="true" /></> : <textarea aria-label="Message" autoComplete="off" className="sand-email-composer__body" disabled={disabled} onChange={(event) => setBody(event.currentTarget.value)} placeholder="Write a message" rows={4} spellCheck value={body} />}</div>
    {status === "editable" && visualLineCount(body) > 8 ? <button onClick={() => setExpanded((value) => !value)} type="button">{expanded ? "Show less" : "Show more"}<span aria-hidden="true">⌄</span></button> : null}
    <div><button disabled={!valid} type="submit">Send email</button><button disabled={disabled} onClick={(event) => event.preventDefault()} type="button">Discard</button></div>
  </form>;
}

export default EmailDraftTranscriptCard;
