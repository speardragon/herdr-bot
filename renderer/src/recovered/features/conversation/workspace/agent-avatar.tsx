import { useMemo, type CSSProperties } from "react";
import { OnboardingCharacter, resolvePersonaColor, resolvePersonaShape } from "../../onboarding/signed-in/character";
import type { OnboardingCharacterState } from "../../onboarding/signed-in/scene";
import { personaAvatarImageSrc, type PersonaAvatarImageMap } from "../../../../production/persona-avatar-images";
import blackBotAvatarImage from "../../../../assets/persona-avatars/black-bot.png";
import brownBotAvatarImage from "../../../../assets/persona-avatars/brown-bot.png";
import redBotAvatarImage from "../../../../assets/persona-avatars/red-bot.png";
import orangeBotAvatarImage from "../../../../assets/persona-avatars/orange-bot.png";
import yellowBotAvatarImage from "../../../../assets/persona-avatars/yellow-bot.png";
import greenBotAvatarImage from "../../../../assets/persona-avatars/green-bot.png";
import cyanBotAvatarImage from "../../../../assets/persona-avatars/cyan-bot.png";
import blueBotAvatarImage from "../../../../assets/persona-avatars/blue-bot.png";
import violetBotAvatarImage from "../../../../assets/persona-avatars/violet-bot.png";
import magentaBotAvatarImage from "../../../../assets/persona-avatars/magenta-bot.png";
import grayBotAvatarImage from "../../../../assets/persona-avatars/gray-bot.png";
// herdr-bot: small (160px), always-inlined-as-data-URI copies of the same 11 images, used ONLY as
// CSS mask-image sources (agent-settings hero edit overlay). Electron loads the renderer over
// file://, and Chromium treats file:// image resources as tainted for pixel-level compositing --
// masking a full-size `?inline`-free import (a plain file:// URL) silently renders nothing at all,
// the same way canvas.toDataURL() on a file:// <img> throws "Tainted canvases may not be exported."
// The `?inline` suffix forces Vite to always emit a base64 data: URI in the JS bundle regardless of
// its normal size-based inlining threshold, so these are never file:// resources to begin with.
import blackBotAvatarMask from "../../../../assets/persona-avatars/masks/black-bot-mask.png?inline";
import brownBotAvatarMask from "../../../../assets/persona-avatars/masks/brown-bot-mask.png?inline";
import redBotAvatarMask from "../../../../assets/persona-avatars/masks/red-bot-mask.png?inline";
import orangeBotAvatarMask from "../../../../assets/persona-avatars/masks/orange-bot-mask.png?inline";
import yellowBotAvatarMask from "../../../../assets/persona-avatars/masks/yellow-bot-mask.png?inline";
import greenBotAvatarMask from "../../../../assets/persona-avatars/masks/green-bot-mask.png?inline";
import cyanBotAvatarMask from "../../../../assets/persona-avatars/masks/cyan-bot-mask.png?inline";
import blueBotAvatarMask from "../../../../assets/persona-avatars/masks/blue-bot-mask.png?inline";
import violetBotAvatarMask from "../../../../assets/persona-avatars/masks/violet-bot-mask.png?inline";
import magentaBotAvatarMask from "../../../../assets/persona-avatars/masks/magenta-bot-mask.png?inline";
import grayBotAvatarMask from "../../../../assets/persona-avatars/masks/gray-bot-mask.png?inline";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2302348 (Iee avatar dispatcher; Mac SHA256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182a3dcd717...)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=2925837 (Iee avatar dispatcher; Windows SHA256 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=2921693 (Eee/Cee/QCe/hct/gct/dln persona mappings)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=2755564 (sd sand-grok-bot-mark wrapper)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=2933499 (sand-group-avatar and sand-shared-room-avatar branches)
// The dispatcher order is artifact data URL -> shared-room -> group -> persona
// mark. There is deliberately no initials or CSS-generated fallback branch.

export type AgentAvatarSize = "xs" | "sm" | "md" | "lg" | "xl";
export type AgentAvatarKind = "agent" | "group" | "shared-room" | "everyone";
export type PersonaState = OnboardingCharacterState;

export interface AgentAvatarProps {
  readonly agentId: string;
  readonly name?: string;
  readonly dataUrl?: string | null;
  readonly shape?: string | null;
  readonly color?: string | null;
  readonly size?: AgentAvatarSize;
  readonly kind?: AgentAvatarKind;
  readonly memberIds?: readonly string[];
  readonly state?: PersonaState;
  readonly currentActivity?: unknown | null;
  readonly isRunning?: boolean;
  readonly isComposingMessage?: boolean;
  readonly awaitingUserResponse?: unknown | null;
  readonly isStatic?: boolean;
  readonly paused?: boolean;
  readonly isFollowingPointer?: boolean;
  readonly followTarget?: { x: number; y: number } | null;
  readonly emphasis?: boolean;
  readonly spinSignal?: number;
}

const SIZE_PX: Record<AgentAvatarSize, number> = { xs: 16, sm: 22, md: 28, lg: 36, xl: 72 };

const ACTIVITY_TO_STATE: Record<string, PersonaState> = {
  thinking: "thinking", searching: "searching", browsing: "searching", reading: "searching", connecting: "searching",
  writing: "working", coding: "working", generating: "loading", "running-commands": "working", "on-its-computer": "working",
  "on-your-computer": "working", working: "working", messaging: "orbit", waiting: "orbit", sending: "sending"
};

function activityState(activity: unknown): PersonaState | null {
  if (typeof activity !== "object" || activity == null) return null;
  const value = activity as Record<string, unknown>;
  if (value.kind === "thinking") return "thinking";
  if (value.kind === "tool" && value.tool === "SendToAgent") return "sending";
  if (typeof value.verb === "string" && ACTIVITY_TO_STATE[value.verb] != null) return ACTIVITY_TO_STATE[value.verb];
  if (typeof value.tool === "string") {
    if (value.tool === "WebSearch") return "searching";
    if (value.tool === "WebFetch" || value.tool.startsWith("browser_")) return "searching";
    if (value.tool === "GenerateImage") return "loading";
    if (value.tool === "SendToAgent" || value.tool === "UpdateAgent") return "sending";
    if (value.tool === "Task" || value.tool === "Await" || value.tool === "CheckSubagent") return "orbit";
    return "working";
  }
  return null;
}

/** Mirrors the shipped mct/wbe state gate using the current typed roster inputs. */
export function personaStateFromAgent(input: Pick<AgentAvatarProps, "awaitingUserResponse" | "currentActivity" | "isRunning" | "isComposingMessage">): PersonaState {
  if (input.awaitingUserResponse != null) return "idle";
  const activity = activityState(input.currentActivity);
  if (activity != null) return activity;
  if (input.isComposingMessage === true) return "thinking";
  return input.isRunning === true ? "working" : "idle";
}

function avatarState(props: AgentAvatarProps): PersonaState {
  return props.state ?? personaStateFromAgent(props);
}

function avatarStyle(sizePx: number): CSSProperties {
  return { height: sizePx, width: sizePx };
}

// herdr-bot: bots without an explicit avatar shape render as clouds, matching the shipped Grok Bot look.
const HERDR_BOT_DEFAULT_SHAPE = "cloud";

// herdr-bot: color -> custom avatar image (persona-avatar-images.ts), one per character.tsx COLORS
// key. Every resolved persona color now has an image, so the drawn PersonaMark/OnboardingCharacter
// mark below is effectively retired for agent avatars -- it stays as the fallback for any color that
// might reach here without a mapped image (e.g. a future eleventh-hour color-resolver change).
const PERSONA_AVATAR_IMAGES: PersonaAvatarImageMap = {
  black: blackBotAvatarImage,
  brown: brownBotAvatarImage,
  red: redBotAvatarImage,
  orange: orangeBotAvatarImage,
  yellow: yellowBotAvatarImage,
  green: greenBotAvatarImage,
  cyan: cyanBotAvatarImage,
  blue: blueBotAvatarImage,
  violet: violetBotAvatarImage,
  magenta: magentaBotAvatarImage,
  gray: grayBotAvatarImage
};

/** herdr-bot: the exact image URL AgentAvatar itself would render for these props -- a custom photo
 * (dataUrl) first, else the persona-color image, else null when AgentAvatar would fall through to
 * the drawn SVG mark instead (no image). Exported so a caller that needs the raw image URL (the
 * agent-settings hero's edit overlay, masked to the image's own silhouette) doesn't re-implement
 * AgentAvatar's own dispatch order. */
export function resolveAgentAvatarImageSrc({ agentId, dataUrl, color }: { agentId: string; dataUrl?: string | null; color?: string | null }): string | null {
  if (typeof dataUrl === "string" && dataUrl.length > 0) return dataUrl;
  return personaAvatarImageSrc(PERSONA_AVATAR_IMAGES, resolvePersonaColor(agentId, color));
}

const PERSONA_AVATAR_MASK_IMAGES: PersonaAvatarImageMap = {
  black: blackBotAvatarMask,
  brown: brownBotAvatarMask,
  red: redBotAvatarMask,
  orange: orangeBotAvatarMask,
  yellow: yellowBotAvatarMask,
  green: greenBotAvatarMask,
  cyan: cyanBotAvatarMask,
  blue: blueBotAvatarMask,
  violet: violetBotAvatarMask,
  magenta: magentaBotAvatarMask,
  gray: grayBotAvatarMask
};

/**
 * A version of `resolveAgentAvatarImageSrc` safe to use as a CSS `mask-image` source. A custom photo
 * (`dataUrl`) is only returned when it is already a `data:` URI -- anything else (a future file-based
 * path) could be file:// and silently mask to nothing, so this returns `null` instead and the caller
 * falls back to an unmasked overlay. The persona-color case always returns one of the small
 * always-inlined mask images above, never the full-size file-based one `resolveAgentAvatarImageSrc`
 * uses for the visible `<img>`.
 */
export function resolveAgentAvatarMaskSrc({ agentId, dataUrl, color }: { agentId: string; dataUrl?: string | null; color?: string | null }): string | null {
  if (typeof dataUrl === "string" && dataUrl.length > 0) return dataUrl.startsWith("data:") ? dataUrl : null;
  return personaAvatarImageSrc(PERSONA_AVATAR_MASK_IMAGES, resolvePersonaColor(agentId, color));
}

function PersonaMark({ agentId, color, shape, size, sizePx, state, isStatic, paused, isFollowingPointer, followTarget, emphasis, spinSignal }: { agentId: string; color: string; shape: string; state: PersonaState; size?: AgentAvatarSize } & Pick<AgentAvatarProps, "isStatic" | "paused" | "isFollowingPointer" | "followTarget" | "emphasis" | "spinSignal"> & { sizePx: number }) {
  const imageSrc = personaAvatarImageSrc(PERSONA_AVATAR_IMAGES, color);
  if (imageSrc != null) {
    return <img alt="" aria-hidden="true" className="sand-agent-avatar" data-avatar-color={color} data-avatar-kind="persona-image" data-size={typeof size === "string" ? size : undefined} draggable={false} height={sizePx} src={imageSrc} style={avatarStyle(sizePx)} width={sizePx} />;
  }
  return <span aria-hidden="true" className="sand-agent-avatar sand-grok-bot-mark" data-avatar-color={color} data-avatar-shape={shape} data-size={typeof size === "string" ? size : undefined} data-emphasis={emphasis || undefined} style={{ ...avatarStyle(sizePx), filter: emphasis ? "drop-shadow(0 0 3px color-mix(in srgb, currentColor 32%, transparent))" : undefined }}>
    <OnboardingCharacter
      color={color}
      emphasis={emphasis}
      followTarget={followTarget}
      isFollowingPointer={isFollowingPointer}
      paused={paused === true || isStatic === true}
      shape={shape}
      sizePx={sizePx}
      sourceId={`sand-agent-mark-source-${agentId}`}
      spinSignal={spinSignal}
      state={state}
    />
  </span>;
}

function SharedRoomAvatar({ sizePx }: { sizePx: number }) {
  return <span aria-hidden="true" className="sand-agent-avatar sand-shared-room-avatar" data-avatar-kind="shared-room" style={avatarStyle(sizePx)}>
    <svg aria-hidden="true" style={{ fill: "none", height: "65%", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 1.5, width: "65%" }} viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c2 2.1 3 4.8 3 8s-1 5.9-3 8c-2-2.1-3-4.8-3-8s1-5.9 3-8Z" /></svg>
  </span>;
}

/** herdr-bot: a plain multi-person glyph for the "@everyone" mention -- deliberately not a
 * composited GroupAvatar of the scope's actual members, since "everyone" is a fixed placeholder
 * mark, not an identity made of specific bots. */
function EveryoneAvatar({ sizePx }: { sizePx: number }) {
  return <span aria-hidden="true" className="sand-agent-avatar sand-everyone-avatar" data-avatar-kind="everyone" style={avatarStyle(sizePx)}>
    <svg aria-hidden="true" style={{ fill: "none", height: "65%", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 1.5, width: "65%" }} viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M2.5 19.5c0-3 2.9-5.25 6.5-5.25s6.5 2.25 6.5 5.25" /><circle cx="17" cy="8.5" r="2.25" /><path d="M14.8 14.6c.6-.15 1.25-.22 1.95-.1 2.35.4 4.75 2.15 4.75 5" /></svg>
  </span>;
}

function groupSlots(count: number, frame: number): Array<{ x: number; y: number; size: number }> {
  if (count <= 1) return [{ x: 0, y: 0, size: frame }];
  if (count === 2) { const size = frame * 2 / 3; return [{ x: 0, y: 0, size }, { x: frame - size, y: frame - size, size }]; }
  const size = frame * 5 / 9, offset = frame - size;
  return count === 3
    ? [{ x: offset / 2, y: 0, size }, { x: 0, y: offset, size }, { x: offset, y: offset, size }]
    : [{ x: 0, y: 0, size }, { x: offset, y: 0, size }, { x: 0, y: offset, size }, { x: offset, y: offset, size }];
}

function GroupAvatar({ agentId, memberIds, sizePx, state, isStatic, paused }: { agentId: string; memberIds: readonly string[]; sizePx: number; state: PersonaState; isStatic?: boolean; paused?: boolean }) {
  const participants = memberIds.length === 0 ? [agentId] : memberIds;
  const visible = participants.slice(0, participants.length > 4 ? 3 : 4);
  const slots = groupSlots(Math.min(visible.length + (participants.length > 4 ? 1 : 0), 4), sizePx);
  return <span aria-hidden="true" className="sand-agent-avatar sand-group-avatar" data-avatar-kind="group" data-member-count={participants.length} style={avatarStyle(sizePx)}>
    {visible.slice(0, slots.length).map((memberId, index) => {
      const color = resolvePersonaColor(memberId);
      const shape = resolvePersonaShape(memberId, HERDR_BOT_DEFAULT_SHAPE);
      const slot = slots[index];
      return <span key={memberId} style={{ display: "block", height: slot.size, left: slot.x, overflow: "hidden", position: "absolute", top: slot.y, width: slot.size }}><PersonaMark agentId={memberId} color={color} isStatic={isStatic ?? true} paused={paused} shape={shape} sizePx={slot.size} state={state} /></span>;
    })}
    {participants.length > 4 ? <span style={{ background: "var(--cursor-bg-elevated)", border: "1px solid var(--cursor-stroke-secondary)", borderRadius: "var(--cursor-radius-full)", bottom: 0, color: "var(--cursor-text-primary)", display: "grid", fontSize: 9, lineHeight: 1, minHeight: 13, minWidth: 13, padding: "1px 3px", placeItems: "center", position: "absolute", right: 0 }}>+{participants.length - 3}</span> : null}
  </span>;
}

export function AgentAvatar(props: AgentAvatarProps) {
  const size = props.size ?? "md";
  const sizePx = SIZE_PX[size];
  const state = avatarState(props);
  const color = useMemo(() => resolvePersonaColor(props.agentId, props.color), [props.agentId, props.color]);
  const shape = useMemo(() => resolvePersonaShape(props.agentId, props.shape ?? HERDR_BOT_DEFAULT_SHAPE), [props.agentId, props.shape]);
  const dataUrl = typeof props.dataUrl === "string" && props.dataUrl.length > 0 ? props.dataUrl : null;
  const kind = props.kind ?? "agent";
  if (kind === "everyone") return <EveryoneAvatar sizePx={sizePx} />;
  if (dataUrl != null) return <img alt="" aria-hidden="true" className="sand-agent-avatar" data-avatar-kind="photo" data-size={size} draggable={false} height={sizePx} src={dataUrl} style={avatarStyle(sizePx)} width={sizePx} />;
  if (kind === "shared-room") return <SharedRoomAvatar sizePx={sizePx} />;
  if (kind === "group") return <GroupAvatar agentId={props.agentId} memberIds={props.memberIds ?? []} paused={props.paused} sizePx={sizePx} state={state} />;
  return <PersonaMark agentId={props.agentId} color={color} emphasis={props.emphasis} followTarget={props.followTarget} isFollowingPointer={props.isFollowingPointer} isStatic={props.isStatic} paused={props.paused} shape={shape} size={size} sizePx={sizePx} spinSignal={props.spinSignal} state={state} />;
}
