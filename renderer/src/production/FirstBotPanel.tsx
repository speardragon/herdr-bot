import { useState, type CSSProperties, type FormEvent } from "react";
import { AVATAR_COLORS } from "../recovered/features/agent-info/avatar-editor/model";
import { AgentAvatar } from "../recovered/features/conversation/workspace/agent-avatar";
import { SandTextField } from "../recovered/ui/sand-form-primitives";
import { SandButton } from "../recovered/ui/sand-kit-primitives";
import { t } from "./locale";
import "./first-bot-panel.css";

// herdr-bot: replaces the plain "아직 만든 봇이 없습니다." / "봇을 만들고 함께 대화를 시작하세요."
// placeholders with a state that can be acted on immediately -- no chat exists yet to open, but
// nothing stops the roster from being empty for longer than a launch-time flash, so this stays
// mounted (not a one-shot onboarding step) for as long as it is. Shape is deliberately not offered
// here: the avatar editor already dropped it for the same reason (see avatar-editor/view.tsx),
// and the persona artwork this app actually renders is keyed by colour only.
function randomAvatarColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]?.id ?? "blue";
}
/** Never sent anywhere -- AgentAvatar needs *an* id to derive a deterministic fallback from, but an
 * explicit `color` always wins over that fallback, so the id itself is inert. */
const DRAFT_AVATAR_ID = "first-bot-draft";
/** 11 colours don't split into a clean grid, so this honeycombs them instead: 6 on top, the
 * remaining 5 below staggered into the gaps between them (offset by half a swatch, see
 * `.hb-first-bot__color-row--offset` in first-bot-panel.css). */
const COLOR_ROWS = [AVATAR_COLORS.slice(0, 6), AVATAR_COLORS.slice(6)] as const;

export interface FirstBotPanelProps {
  readonly pending: boolean;
  readonly error: string | null;
  readonly onCreate: (input: { readonly name?: string; readonly avatarColor: string }) => void;
  /** herdr-bot (Task 7, plan bot-collaboration-and-launch-settings): opens the full New Bot dialog
   * (AI provider, model, reasoning effort, working directory) as an alternative to this panel's own
   * one-click quick-create form, which stays a defaults-only shortcut. */
  readonly onOpenAdvancedSetup: () => void;
}

export function FirstBotPanel({ pending, error, onCreate, onOpenAdvancedSetup }: FirstBotPanelProps) {
  const [name, setName] = useState("");
  const [avatarColor, setAvatarColor] = useState(randomAvatarColor);
  const placeholderName = t("New Bot", "새 Bot");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const trimmed = name.trim();
    onCreate({ ...(trimmed.length > 0 ? { name: trimmed } : {}), avatarColor });
  };

  return (
    <main className="sand-chat-stage hb-first-bot" data-empty="true">
      {/* A non-interactive stand-in for the real per-chat header (ConversationAgentHeader): once the
          bot exists this exact header takes over, so nothing shifts. */}
      <div aria-labelledby="sand-conversation-heading" className="sand-chat-header" role="group">
        <div className="sand-chat-header__identity">
          <span className="sand-chat-header__avatar"><AgentAvatar agentId={DRAFT_AVATAR_ID} color={avatarColor} isStatic name={name.trim() || placeholderName} size="md" /></span>
          {/* Same id the real ConversationAgentHeader gives its title (chat-header.tsx) -- picks up
              production.css's `#sand-conversation-heading { font-size: lg; font-weight: 600 }` for
              free, and stays in sync with it automatically if that rule ever changes. The two never
              coexist in the DOM (this panel only renders when there is no active chat to show a real
              header for), so the duplicate id is never actually ambiguous at runtime. */}
          <span id="sand-conversation-heading">{placeholderName}</span>
        </div>
      </div>
      <div className="hb-first-bot__body">
        <form className="hb-first-bot__card" onSubmit={submit}>
          <AgentAvatar agentId={DRAFT_AVATAR_ID} color={avatarColor} isStatic name={name.trim() || placeholderName} size="xl" />
          <div aria-label={t("Character color", "캐릭터 색상")} className="hb-first-bot__colors" role="radiogroup">
            {COLOR_ROWS.map((row, rowIndex) => (
              <div className="hb-first-bot__color-row" key={rowIndex}>
                {row.map((candidate) => (
                  <button
                    aria-checked={avatarColor === candidate.id}
                    aria-label={candidate.label}
                    className="hb-first-bot__color"
                    disabled={pending}
                    key={candidate.id}
                    onClick={() => setAvatarColor(candidate.id)}
                    role="radio"
                    style={{ "--hb-avatar-swatch": candidate.value } as CSSProperties}
                    title={candidate.label}
                    type="button"
                  />
                ))}
              </div>
            ))}
          </div>
          <SandTextField autoFocus disabled={pending} label={t("Name")} onChange={(event) => setName(event.currentTarget.value)} placeholder={placeholderName} value={name} />
          <SandButton disabled={pending} type="submit">{pending ? t("Creating…", "만드는 중…") : t("Get started", "시작하기")}</SandButton>
          {/* herdr-bot (Task 7): the only escape hatch from the defaults-only quick form to the full
              provider/model/reasoning/working-directory dialog before any bot exists yet -- after the
              first bot, this same dialog is reachable from NewChatHeader's "+" picker instead. */}
          <button className="hb-first-bot__advanced-link" disabled={pending} onClick={onOpenAdvancedSetup} type="button">{t("Advanced setup", "고급 설정")}</button>
          {error != null ? <p className="hb-first-bot__error" role="alert">{error}</p> : null}
        </form>
      </div>
    </main>
  );
}
