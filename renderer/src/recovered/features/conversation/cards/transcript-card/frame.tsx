import type { HTMLAttributes, ReactNode } from "react";
import type { TranscriptCardFrameVariant } from "./registry";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5096321 (immutable frame selector styles)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5101117 (immutable variant-to-style map)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5101409 (immutable Lve frame owner)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5102211 (immutable data-group-start behavior)

export interface TranscriptCardFrameStyle {
  readonly wrap: string;
  readonly groupStart: string;
}

export const TRANSCRIPT_CARD_FRAME_STYLES: Readonly<Record<TranscriptCardFrameVariant, TranscriptCardFrameStyle>> = Object.freeze({
  tab: {
    wrap: "sand-78zum5 sand-dt5ytf sand-1cy8zhl sand-11twubx sand-145rt9f",
    groupStart: "sand-19snzy6 sand-1sl1sun",
  },
  link: {
    wrap: "sand-78zum5 sand-dt5ytf sand-11twubx sand-h8yej3 sand-145rt9f sand-qcrz7y sand-1jy3azn",
    groupStart: "sand-19snzy6 sand-1sl1sun",
  },
  file: {
    wrap: "sand-78zum5 sand-dt5ytf sand-11twubx sand-h8yej3 sand-1vyvmim sand-qcrz7y",
    groupStart: "sand-19snzy6 sand-1sl1sun",
  },
  widget: {
    wrap: "sand-78zum5 sand-dt5ytf sand-h8yej3 sand-euugli sand-1ed8p9w sand-qcrz7y",
    groupStart: "sand-19snzy6",
  },
  question: {
    wrap: "sand-78zum5 sand-dt5ytf sand-h8yej3 sand-1q8iv8g sand-qcrz7y",
    groupStart: "sand-19snzy6",
  },
});

export interface TranscriptCardFrameProps extends Omit<HTMLAttributes<HTMLDivElement>, "children" | "className"> {
  readonly variant: TranscriptCardFrameVariant;
  readonly className?: string;
  readonly isGroupStart?: boolean;
  /** Accepted by the shipped owner but intentionally not emitted as a DOM attribute. */
  readonly timestampMs?: number;
  readonly children: ReactNode;
}

/**
 * The dependency-free shared card frame. Reply/thread/action behavior belongs
 * to the separate immutable outer owner and is intentionally not composed here.
 */
export function TranscriptCardFrame({ variant, className, isGroupStart, timestampMs, children, ...rest }: TranscriptCardFrameProps) {
  void timestampMs;
  const style = TRANSCRIPT_CARD_FRAME_STYLES[variant];
  const frameClassName = ["sand-message-card", className, style.wrap, isGroupStart === true ? style.groupStart : null]
    .filter((value): value is string => value != null && value.length > 0)
    .join(" ");
  return <div {...rest} className={frameClassName} data-group-start={isGroupStart || undefined}>{children}</div>;
}

