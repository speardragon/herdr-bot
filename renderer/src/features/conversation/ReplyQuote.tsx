import { getAuthor, getRawText } from "./entry-shapes.ts";
import type { TranscriptEntry } from "../../data/types.ts";
import styles from "./ReplyQuote.module.css";

export interface ReplyQuoteProps {
  readonly quotedEntry: TranscriptEntry | null;
  /** `quotedEntry` is `null` either because the id doesn't resolve (deleted/not loaded) or `replyTo`
   * wasn't set at all -- the caller only renders this when it has a `replyTo` id, so `null` here
   * specifically means "the referenced message isn't available", not "there's no reply". */
  readonly missingLabel: string;
  /** True when this renders inside the user's own (solid, inverted) bubble -- the default tertiary
   * text color assumes the page's usual light/raised background and is nearly illegible against that
   * solid fill, so a dimmed variant of the bubble's own text color is used instead. */
  readonly mine?: boolean;
}

/** The quoted-message preview above a reply bubble. Distinct from
 * `data/reply-target.ts` (which coordinates the *composing* side with the composer) -- this only reads
 * an already-sent message's `replyTo` id back out of the loaded transcript. */
export function ReplyQuote({ quotedEntry, missingLabel, mine = false }: ReplyQuoteProps) {
  const rootClass = `${styles["hb-reply-quote"]} ${mine ? styles["hb-reply-quote--mine"] : ""}`;
  if (quotedEntry == null) {
    return <div className={rootClass}>{missingLabel}</div>;
  }
  const author = getAuthor(quotedEntry);
  const text = getRawText(quotedEntry) ?? "";
  return (
    <div className={rootClass}>
      {author != null && <span className={styles["hb-reply-quote-author"]}>{author.name}</span>}
      <span className={styles["hb-reply-quote-text"]}>{text}</span>
    </div>
  );
}
