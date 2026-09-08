// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=5320947-5321511
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#sha256=80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5#byteOffset=6685348-6685912

export const TRANSCRIPT_LOAD_ERROR_COPY = {
  title: "Couldn't load conversation",
  detail: "Couldn't load this conversation. Check your connection and try again.",
  retry: "Retry",
  titleId: "sand-transcript-error-title",
  detailId: "sand-transcript-error-detail"
} as const;

export interface TranscriptLoadErrorSurfaceProps {
  readonly onRetry: () => void | Promise<void>;
}

/** Parent-owned error surface for the transcript loader; it has no independent subscription or dismissal lifecycle. */
export function TranscriptLoadErrorSurface({ onRetry }: TranscriptLoadErrorSurfaceProps) {
  return <div aria-describedby={TRANSCRIPT_LOAD_ERROR_COPY.detailId} aria-labelledby={TRANSCRIPT_LOAD_ERROR_COPY.titleId} className="sand-chat-transcript-loading sand-78zum5 sand-dt5ytf sand-1iyjqo2 sand-s83m0k sand-1t1x2f9 sand-6s0dn4 sand-l56j7k sand-1v2ro7d sand-2lwn1j sand-h8yej3" role="alert">
    <div className="sand-chat-transcript-error sand-78zum5 sand-dt5ytf sand-1v2ro7d sand-xc7z9f sand-4l9tsp sand-2b8uid">
      <h2 id={TRANSCRIPT_LOAD_ERROR_COPY.titleId}>{TRANSCRIPT_LOAD_ERROR_COPY.title}</h2>
      <p id={TRANSCRIPT_LOAD_ERROR_COPY.detailId}>{TRANSCRIPT_LOAD_ERROR_COPY.detail}</p>
      <button onClick={() => { void onRetry(); }} type="button">{TRANSCRIPT_LOAD_ERROR_COPY.retry}</button>
    </div>
  </div>;
}
