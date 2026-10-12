import type { PersonaColor } from "../data/avatar-colors.ts";
import { personaAssetFor } from "./persona-assets.ts";
import { roomCells } from "./room-cells.ts";
import type { StackMember } from "./room-cells.ts";
import { StatusDot } from "./StatusDot.tsx";
import styles from "./Avatar.module.css";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";
export type AvatarShape = "squircle" | "circle";
/** Only the two tones an avatar's corner badge ever shows -- distinct from
 * `StatusDot`'s own `StatusDotTone`, which also covers the unrelated plain "unread" dot. */
export type AvatarStatusTone = "blocked" | "working" | null;

const SIZE_PX: Record<AvatarSize, number> = { xs: 20, sm: 28, md: 44, lg: 64, xl: 96 };

interface BaseProps {
  readonly size?: AvatarSize;
  readonly shape?: AvatarShape;
  /** The red/orange status dot over the bottom-right corner -- `null`/omitted for none. A
   * room never passes this (rooms have no single status of their own). */
  readonly statusDot?: AvatarStatusTone;
}

export interface BotAvatarProps extends BaseProps {
  readonly kind: "bot";
  readonly color: PersonaColor;
  readonly name: string;
}

export interface UserAvatarProps extends BaseProps {
  readonly kind: "user";
  /** Defaults to "Me" -- the only user avatar this app renders (sidebar room rows show a gray "Me"
   * circle for the user's own last message). */
  readonly label?: string;
}

export type { StackMember } from "./room-cells.ts";

export interface RoomAvatarProps extends BaseProps {
  readonly kind: "room";
  readonly members: readonly StackMember[];
  /** The "Me" badge overlapping the top-left corner (see below) -- omitted entirely (not even a default
   * "Me" fallback) when the caller doesn't pass one, so a purely decorative tiny room glyph (e.g.
   * `Notice.tsx`'s inline delegation icon) can opt out rather than cram illegible text into a few px. */
  readonly meLabel?: string;
}

export type AvatarProps = BotAvatarProps | UserAvatarProps | RoomAvatarProps;

interface Slot {
  readonly top: string;
  readonly left: string;
  readonly size: string;
}

/** Cell positions for a room avatar holding 1-4 cells: one fills the frame, two sit on a diagonal,
 * three form a triangle (two on top, one centered below), four form a 2x2 grid. */
const CELL_LAYOUT: Record<1 | 2 | 3 | 4, readonly Slot[]> = {
  1: [{ top: "0%", left: "0%", size: "100%" }],
  2: [
    { top: "0%", left: "0%", size: "60%" },
    { top: "40%", left: "40%", size: "60%" },
  ],
  3: [
    { top: "0%", left: "0%", size: "52%" },
    { top: "0%", left: "48%", size: "52%" },
    { top: "48%", left: "24%", size: "52%" },
  ],
  4: [
    { top: "0%", left: "0%", size: "50%" },
    { top: "0%", left: "50%", size: "50%" },
    { top: "50%", left: "0%", size: "50%" },
    { top: "50%", left: "50%", size: "50%" },
  ],
};

/** Avatar rendering: a tinted mascot (bot), a "Me" initial disc (user), or a stacked member cluster
 * (room). `size` picks a named scale (xs..xl); the underlying asset resolution
 * (full vs. small-crop) is chosen automatically from the rendered pixel size (see persona-assets.ts). */
export function Avatar(props: AvatarProps) {
  const size = props.size ?? "md";
  const shape = props.shape ?? "squircle";
  const px = SIZE_PX[size];
  const dotSize = Math.max(8, Math.round(px * 0.26));

  if (props.kind === "user") {
    const label = props.label ?? "Me";
    return (
      <span className={styles["hb-avatar"]} style={{ width: px, height: px }}>
        <span className={styles["hb-avatar-user"]} style={{ fontSize: Math.round(px * 0.34) }} aria-hidden>
          {label.slice(0, 2)}
        </span>
        <span className="hb-sr-only">{label}</span>
      </span>
    );
  }

  if (props.kind === "bot") {
    return (
      <span className={styles["hb-avatar"]} style={{ width: px, height: px }}>
        <img draggable={false} className={`${styles["hb-avatar-image"]} ${styles[`hb-avatar--shape-${shape}`]}`} src={personaAssetFor(props.color, px)} alt={props.name} />
        {props.statusDot != null && (
          <span className={styles["hb-avatar-dot"]}>
            <StatusDot tone={props.statusDot} size={dotSize} ring aria-label={props.statusDot === "blocked" ? "needs approval" : "working"} />
          </span>
        )}
      </span>
    );
  }

  // room: up to four cells -- the user's own "Me" (sidebar rows and the info panel), members, and a
  // "+N" count for the rest.
  const cells = roomCells(props.members, props.meLabel);
  const layout = CELL_LAYOUT[(Math.max(1, cells.length) as 1 | 2 | 3 | 4)];

  return (
    <span className={styles["hb-avatar"]} style={{ width: px, height: px }}>
      <span className={styles["hb-avatar-stack"]}>
        {cells.map((cell, index) => {
          const slot = layout[index]!;
          const style = { top: slot.top, left: slot.left, width: slot.size, height: slot.size };
          if (cell.kind === "member") {
            return <img draggable={false} key={`${cell.member.name}-${index}`} className={styles["hb-avatar-stack-item"]} style={style} src={personaAssetFor(cell.member.color, px * 0.6)} alt={cell.member.name} />;
          }
          const fontSize = Math.max(7, Math.round(px * (cell.kind === "me" ? 0.18 : 0.22)));
          return (
            <span key={cell.kind} className={styles["hb-avatar-stack-chip"]} style={{ ...style, fontSize }}>
              <span className={styles["hb-avatar-stack-chip-disc"]}>{cell.kind === "me" ? cell.label : `+${cell.count}`}</span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
