import { createElement, type CSSProperties, type HTMLAttributes, type ReactNode, type Ref } from "react";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=1131225 (hnt row status layout state machine; Mac SHA256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=1131705 (row marker labels; Mac SHA256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=1133965 (sand-agent-item__trailing marker region; Mac SHA256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=1131933 (d4e row activity branch; Mac SHA256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=1134372 (sand-agent-item__activity carrier; Mac SHA256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=1441669 (hnt row status layout state machine; Windows SHA256 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=1442282 (row marker labels; Windows SHA256 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=1445196 (sand-agent-item__trailing marker region; Windows SHA256 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=1442566 (d4e row activity branch; Windows SHA256 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=1445669 (sand-agent-item__activity carrier; Windows SHA256 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5)

export type SidebarAgentRowLayout = "expanded" | "collapsed" | "pinned";
export type SidebarAgentStatusMarker = "blocked" | "unread" | null;
export type SidebarAgentStatusCorner = "marker" | "ring" | "running" | null;
export type SidebarStatusDotStatus = "working" | "needs-attention" | "offline" | "error" | "info";

const STATUS_DOT_CLASSES: Record<SidebarStatusDotStatus, string> = {
  working: "sand-1rm5x0x",
  "needs-attention": "sand-mab63l",
  offline: "sand-3zn3jg",
  error: "sand-18he5m",
  info: "sand-2uzfp6"
};
const STATUS_DOT_ROOT_CLASS = "sand-1rg5ohu sand-2lah0s sand-1xc55vz sand-dk7pt sand-149ho13";
const ACTIVITY_CLASS = "sand-agent-item__activity";

export interface SidebarStatusDotProps extends Omit<HTMLAttributes<HTMLSpanElement>, "className" | "style"> {
  readonly status?: SidebarStatusDotStatus;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly ref?: Ref<HTMLSpanElement>;
}

/** Exact d0e: stylex state classes plus the shared status-dot span contract. */
export function SidebarStatusDot({ status = "working", className, style, ref, ...rest }: SidebarStatusDotProps) {
  return createElement("span", {
    ...rest,
    className: ["sand-kit-status-dot", STATUS_DOT_ROOT_CLASS, STATUS_DOT_CLASSES[status], className].filter(Boolean).join(" "),
    "data-status": status,
    ref,
    style
  });
}

export interface SidebarAgentStatusInput {
  readonly layout?: SidebarAgentRowLayout;
  readonly waitingReason?: string;
  readonly hasUnread?: boolean;
  readonly isRunning?: boolean;
  /** True only when the shipped row has a named activity preview. */
  readonly isActivityNamed?: boolean;
}

export interface SidebarAgentStatusProjection {
  readonly marker: SidebarAgentStatusMarker;
  readonly markerLabel: "Needs attention" | "Unread activity" | undefined;
  readonly isWorking: boolean;
  readonly corner: SidebarAgentStatusCorner;
  readonly trailing: "marker" | null;
}

export interface SidebarAgentActivityProps {
  /** The existing last-entry preview; empty activity remains an empty carrier. */
  readonly preview?: ReactNode;
  readonly previewTitle?: string;
}

/** Exact d4e working-preview branch; unavailable private activity styling stays CSS-owned. */
export function SidebarAgentActivity({ preview, previewTitle }: SidebarAgentActivityProps) {
  return createElement("span", {
    className: ACTIVITY_CLASS,
    ...(previewTitle == null || previewTitle.length === 0 ? {} : { title: previewTitle })
  }, preview ?? null);
}

// herdr-bot: this projection now feeds only the expanded row's "working" activity preview
// (isWorking) and the preview-card marker label. The dots themselves moved: the runtime-status dot
// on the avatar is sidebar-status-dot.ts + sidebar.tsx's StatusDot, and the expanded row's blue
// unread dot is rendered directly in sidebar.tsx's trailing column.
export function projectSidebarAgentStatus({ layout = "expanded", waitingReason, hasUnread = false, isRunning = false }: SidebarAgentStatusInput): SidebarAgentStatusProjection {
  const marker: SidebarAgentStatusMarker = waitingReason != null ? "blocked" : hasUnread ? "unread" : null;
  const isWorking = waitingReason == null && isRunning;
  const markerLabel = marker === "blocked" ? "Needs attention" : marker === "unread" ? "Unread activity" : undefined;

  const markerCorner: SidebarAgentStatusCorner = marker == null ? null : "marker";
  return {
    marker,
    markerLabel,
    isWorking,
    corner: layout === "expanded" ? null : markerCorner,
    trailing: layout === "expanded" && marker != null ? "marker" : null
  };
}
