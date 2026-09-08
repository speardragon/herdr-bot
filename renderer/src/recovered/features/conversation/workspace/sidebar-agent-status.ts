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
const CORNER_ROOT_CLASS = "sand-10l6tqk sand-3nfvp2 sand-6s0dn4 sand-l56j7k sand-149ho13 sand-47corl";
const CORNER_ANIMATION_CLASS = "sand-1aquc0h sand-1jq8d06 sand-1lfcbla";
const TRAILING_CLASS = "sand-agent-item__trailing";
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

export interface SidebarAgentStatusViewProps extends SidebarAgentStatusInput {
  /** Private d0e indicator slot; omitted when that renderer primitive is unavailable. */
  readonly renderIndicator?: (status: SidebarStatusDotStatus) => ReactNode;
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

export function projectSidebarAgentStatus({ layout = "expanded", waitingReason, hasUnread = false, isRunning = false, isActivityNamed = false }: SidebarAgentStatusInput): SidebarAgentStatusProjection {
  const marker: SidebarAgentStatusMarker = waitingReason != null ? "blocked" : hasUnread ? "unread" : null;
  const isWorking = waitingReason == null && isRunning;
  const runningState: Exclude<SidebarAgentStatusCorner, "marker" | null> | null = isWorking ? (isActivityNamed ? "ring" : "running") : null;
  const markerLabel = marker === "blocked" ? "Needs attention" : marker === "unread" ? "Unread activity" : undefined;

  const markerCorner: SidebarAgentStatusCorner = marker == null ? null : "marker";
  return {
    marker,
    markerLabel,
    isWorking,
    corner: layout === "expanded" ? (runningState === "running" ? "running" : null) : markerCorner ?? runningState,
    trailing: layout === "expanded" && marker != null ? "marker" : null
  };
}

function indicatorFor(projection: SidebarAgentStatusProjection, renderIndicator?: (status: SidebarStatusDotStatus) => ReactNode): ReactNode {
  const status: SidebarStatusDotStatus = projection.marker === "blocked" ? "needs-attention" : projection.marker === "unread" ? "info" : "working";
  return (renderIndicator ?? ((nextStatus) => createElement(SidebarStatusDot, { status: nextStatus })))(status);
}

/** Exact corner wrapper used for running/marker states; named-activity rings stay fail-closed without the private spinner. */
export function SidebarAgentStatusCorner({ layout = "expanded", renderIndicator, ...input }: SidebarAgentStatusViewProps) {
  const projection = projectSidebarAgentStatus({ ...input, layout });
  if (projection.corner == null || projection.corner === "ring") return null;
  const pinned = layout === "pinned";
  const size = pinned ? 10 : 8;
  const status = projection.markerLabel == null ? undefined : projection.markerLabel;
  const className = [
    "sand-agent-item__corner-dot",
    CORNER_ROOT_CLASS,
    CORNER_ANIMATION_CLASS
  ].join(" ");
  return createElement("span", {
    ...(status == null ? { "aria-hidden": true } : { "aria-label": status, role: "status" }),
    className,
    style: { width: size, height: size, right: 2, bottom: 2 }
  }, indicatorFor(projection, renderIndicator));
}

/** Exact expanded-row trailing marker wrapper. */
export function SidebarAgentStatusView({ renderIndicator, ...input }: SidebarAgentStatusViewProps) {
  const projection = projectSidebarAgentStatus(input);
  if (projection.trailing !== "marker" || projection.markerLabel == null) return null;
  return createElement("span", { "aria-label": projection.markerLabel, className: TRAILING_CLASS, role: "status" }, indicatorFor(projection, renderIndicator));
}
