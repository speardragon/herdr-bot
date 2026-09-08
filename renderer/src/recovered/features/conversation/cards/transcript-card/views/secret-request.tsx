import { useId, useState, type FormEvent } from "react";
import type { SecretRequestEntry } from "../secret-request-actions";
import { projectLeafEntry, useAdapterVersion, useTranscriptCardLeafProviders, type TranscriptCardLeafProps } from "./shared";

// @evidence src/app/dist/renderer/assets/view-HYU0bFxa.js#byteOffset=502 (secret request state and submit lifecycle)
// @evidence src/app/dist/renderer/assets/view-HYU0bFxa.js#byteOffset=583 (exact submitSecret payload)
// @evidence src/app/dist/renderer/assets/view-HYU0bFxa.js#byteOffset=1813 (secret input and Save securely action)
// @evidence src/app/dist/renderer/assets/view-HYU0bFxa.js#byteOffset=4905 (stored securely presentation)

const SECRET_CARD_CLASS = "sand-secret-request sand-1g0q52 sand-h8yej3 sand-euugli sand-gqmno8 sand-b3r6kr sand-78zum5 sand-dt5ytf sand-883omv sand-c7ga6q";
const SECRET_SAVED_CARD_CLASS = `${SECRET_CARD_CLASS} sand-1q0g3np sand-6s0dn4 sand-167g77z`;
const SECRET_INPUT_CLASS = "sand-secret-request__field sand-1iyjqo2 sand-s83m0k sand-1r8uery sand-euugli sand-9f619 sand-10w6t97 sand-1yrsyyn sand-cicffo sand-10b6aqq sand-1lqa7cf sand-mkeg23 sand-1y0btm7 sand-13747pv sand-uslytk sand-ur7f20 sand-1ua6jya sand-1wd3ewq sand-jb2p0i sand-fc7y3v sand-1yxxptd sand-1t137rt sand-1v2bezs sand-ompknl";
const SECRET_BUTTON_CLASS = "sand-2lah0s sand-10w6t97 sand-ur7f20 sand-cicffo sand-1lqa7cf sand-fc7y3v sand-1yxxptd sand-1wclgxm sand-1e15362 sand-1gzh0bn sand-xcaa6e sand-7n8uir sand-gd8bvy sand-1fgtraw";

function placeholderForLabel(label: string): string {
  return /^(?:a|an|the|your|my)\s/i.test(label) ? `Paste ${label}` : `Paste your ${label}`;
}

export function SecretRequestTranscriptCard(props: TranscriptCardLeafProps) {
  const entry = projectLeafEntry(props.entry);
  const providers = useTranscriptCardLeafProviders();
  const adapter = providers?.secretRequests ?? null;
  const version = useAdapterVersion(adapter);
  const titleId = useId();
  const [value, setValue] = useState("");
  if (entry == null || entry.message.type !== "secret-request") return null;
  const request = entry.message.secretRequest;
  const snapshot = adapter?.getSnapshot(entry.id) ?? { entryId: entry.id, scope: providers?.scope ?? { accountSlot: null, agentId: null }, state: entry.secretProvided === true ? "provided" as const : "idle" as const };
  void version;
  const isProvided = entry.secretProvided === true || snapshot.state === "provided";
  const isPending = snapshot.state === "pending";
  const canSubmit = !isProvided && !isPending && !props.isStale && providers?.scope.agentId != null && value.trim().length > 0 && adapter != null;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || adapter == null || providers?.scope.agentId == null) return;
    const submitted = value;
    setValue("");
    void adapter.submit(entry.id, submitted);
  };
  if (isProvided) return <section aria-labelledby={titleId} className={SECRET_SAVED_CARD_CLASS} role="region"><span className="sand-78zum5 sand-6s0dn4 sand-euugli sand-1iyjqo2 sand-s83m0k sand-1r8uery"><h2 className="sand-euugli sand-j0a0fe" id={titleId}>{request.label}</h2><span className="sand-euugli sand-j0a0fe">Saved securely and kept private.</span></span><span className="sand-3nfvp2 sand-6s0dn4 sand-2lah0s sand-1jnr06f sand-1yrsyyn sand-nuq7ks sand-10b6aqq sand-f18ygs sand-149ho13 sand-1buh4up sand-1w5rjie" role="status"><span aria-hidden="true" data-icon-name="check" style={{ fontFamily: "cursor-icons" }}>{String.fromCodePoint(0xeab2)}</span>Saved</span></section>;
  return <form aria-labelledby={titleId} className={SECRET_CARD_CLASS} onSubmit={submit}>
    <div className="sand-78zum5 sand-dt5ytf sand-euugli"><h2 className="sand-euugli sand-j0a0fe" id={titleId}>{request.label}</h2>{request.description == null ? null : <p className="sand-euugli sand-j0a0fe">{request.description}</p>}</div>
    <input aria-labelledby={titleId} autoComplete="off" className={SECRET_INPUT_CLASS} onChange={(event) => setValue(event.currentTarget.value)} placeholder={placeholderForLabel(request.label)} spellCheck={false} type="password" value={value} />
    <div className="sand-78zum5 sand-1cy8zhl sand-167g77z sand-h8yej3 sand-euugli"><button className={SECRET_BUTTON_CLASS} disabled={!canSubmit} type="submit">Save securely</button></div>
    <div className="sand-78zum5 sand-1cy8zhl sand-1jnr06f sand-euugli sand-4b2ntj"><span className="sand-78zum5 sand-2lah0s sand-7r5mf7"><span aria-hidden="true" data-icon-name="shield-check" style={{ fontFamily: "cursor-icons" }}>{String.fromCodePoint(0xebc1)}</span></span><span className="sand-euugli sand-j0a0fe">Stored securely, never shown to your agent.</span></div>
  </form>;
}

export default SecretRequestTranscriptCard;
