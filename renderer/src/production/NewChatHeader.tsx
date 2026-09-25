import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { t } from "./locale";
import { AgentAvatar } from "../recovered/features/conversation/workspace/agent-avatar";
import { SandButton, SandIcon, SandIconButton } from "../recovered/ui/sand-kit-primitives";
import {
  activeOption,
  addDraftMember,
  buildOptionList,
  canCreateGroup,
  moveActiveIndex,
  removeDraftMember,
  selectedMembers,
  shortcutOptionIndex,
  shouldSelectOnEnter,
  type NewChatCandidateBot,
  type NewChatDraft,
  type NewChatOption,
} from "./new-chat-model";

export interface NewChatHeaderBot extends NewChatCandidateBot {
  readonly avatarDataUrl?: string | null;
  readonly avatarShape?: string | null;
  readonly avatarColor?: string | null;
}

export interface NewChatHeaderProps {
  readonly draft: NewChatDraft;
  readonly candidates: readonly NewChatHeaderBot[];
  readonly pending: boolean;
  readonly error: string | null;
  onChange(draft: NewChatDraft): void;
  onCreateBot(name?: string): void;
  onCreateGroup(): void;
  onOpenBot(id: string): void;
  onCancel(): void;
  /** herdr-bot (Task 7): opens the full New Bot dialog (provider/model/reasoning/working-directory)
   * instead of the one-click quick-create; see new-chat-model.ts's "advanced-setup" option kind. */
  onOpenAdvancedSetup(): void;
  /** Bumped by the root shell when the user presses "+" while this draft already exists -- refocuses
   * the input instead of creating a second draft (the root shell owns the "at most one draft" rule). */
  readonly focusSignal?: number;
}

/** Only the first nine rows get a ⌘N badge -- there is no tenth digit chord. */
const SHORTCUT_ROWS = 9;

function optionLeading(option: NewChatOption<NewChatHeaderBot>): ReactNode {
  if (option.kind === "create-bot") return <SandIcon name="plus" size="sm" />;
  if (option.kind === "create-group") return <SandIcon name="people" size="sm" />;
  if (option.kind === "advanced-setup") return <SandIcon name="settings" size="sm" />;
  return <AgentAvatar agentId={option.bot.id} name={option.bot.name} size="sm" isStatic dataUrl={option.bot.avatarDataUrl} shape={option.bot.avatarShape} color={option.bot.avatarColor} />;
}

function optionLabel(option: NewChatOption<NewChatHeaderBot>): string {
  if (option.kind === "create-bot") return option.name == null ? t("Create a new Bot") : t(`Create a Bot named "${option.name}"`, `이름이 "${option.name}"인 Bot 만들기`);
  if (option.kind === "create-group") return t("Create a group chat");
  if (option.kind === "advanced-setup") return t("Advanced setup", "고급 설정");
  return option.bot.name;
}

function optionKey(option: NewChatOption<NewChatHeaderBot>): string {
  return option.kind === "bot" ? option.bot.id : option.kind;
}

/**
 * Header-based replacement for the New Chat modal (herdr-bot Task 5), styled after the Grok Bot
 * reference: a 51px "받는 사람:" row with a borderless inline input and a trailing ×, plus a
 * floating card of icon rows with ⌘1..⌘9 badges. Presentational only -- option composition,
 * keyboard math, shortcut mapping, and default-name logic live in new-chat-model.ts (see
 * new-chat-header.test.ts) so they are testable without a DOM harness.
 */
export function NewChatHeader({ draft, candidates, pending, error, onChange, onCreateBot, onCreateGroup, onOpenBot, onCancel, onOpenAdvancedSetup, focusSignal }: NewChatHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, [focusSignal]);

  const options = useMemo<readonly NewChatOption<NewChatHeaderBot>[]>(() => buildOptionList(draft, candidates), [draft, candidates]);
  const selectedBots = useMemo(() => selectedMembers(draft, candidates), [draft, candidates]);
  const canSubmitGroup = canCreateGroup(draft) && !pending;

  const setQuery = (query: string) => onChange({ ...draft, query });

  const removeMember = (id: string) => {
    onChange(removeDraftMember(draft, id));
    inputRef.current?.focus();
  };

  const enterGroupMode = () => {
    onChange({ ...draft, mode: "group", query: "" });
    setIsOpen(true);
    inputRef.current?.focus();
  };

  const selectOption = (option: NewChatOption<NewChatHeaderBot>) => {
    if (option.kind === "create-bot") { if (!pending) onCreateBot(option.name ?? undefined); return; }
    if (option.kind === "create-group") { enterGroupMode(); return; }
    if (option.kind === "advanced-setup") { setIsOpen(false); onOpenAdvancedSetup(); return; }
    if (draft.mode === "group") {
      const next = addDraftMember(draft, option.bot.id);
      if (next === draft) return; // already selected, or at the member cap -- addDraftMember is a no-op
      onChange(next);
      inputRef.current?.focus();
      return;
    }
    setIsOpen(false);
    onOpenBot(option.bot.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const shortcutIndex = shortcutOptionIndex(event);
    if (shortcutIndex != null && isOpen) {
      // Claim the chord whenever the card is showing badges: the root shell's global ⌘N "focus Nth
      // chat" action runs on the document and bails on defaultPrevented, so a digit past the last
      // row does not jump to another chat. With the card closed the chord falls through to it.
      event.preventDefault();
      const target = options[shortcutIndex];
      if (target != null) selectOption(target);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(moveActiveIndex(activeIndex, options.length, "down"));
      setIsOpen(true);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(moveActiveIndex(activeIndex, options.length, "up"));
      setIsOpen(true);
      return;
    }
    if (event.key === "Enter") {
      // React's isComposing can lag on some IMEs; keyCode 229 is the reliable cross-browser signal.
      if (!shouldSelectOnEnter({ isComposing: event.nativeEvent.isComposing, keyCode: event.keyCode })) return;
      const target = activeOption(options, activeIndex);
      if (target == null) return;
      event.preventDefault();
      selectOption(target);
      return;
    }
    if (event.key === "Tab") {
      setIsOpen(false);
      return;
    }
    if (event.key === "Escape") {
      // Escape first closes the dropdown; only a second Escape (dropdown already closed) discards
      // the draft, mirroring "cancelling while closed" below.
      if (isOpen) { event.preventDefault(); setIsOpen(false); return; }
      onCancel();
    }
  };

  const activeOptionId = activeIndex == null ? undefined : `herdr-new-chat-option-${activeIndex}`;

  return <div className="herdr-new-chat-header">
    <div className="herdr-new-chat-row">
      <span className="herdr-new-chat-label" id="herdr-new-chat-label">{t("To:")}</span>
      <div className="herdr-new-chat-combobox">
        {selectedBots.map(bot => <span className="herdr-member-chip" key={bot.id}>
          <AgentAvatar agentId={bot.id} name={bot.name} size="sm" isStatic dataUrl={bot.avatarDataUrl} shape={bot.avatarShape} color={bot.avatarColor} />
          <span>{bot.name}</span>
          <button type="button" aria-label={`${bot.name} ${t("Remove")}`} onClick={() => removeMember(bot.id)}>×</button>
        </span>)}
        <input
          ref={inputRef}
          role="combobox"
          aria-labelledby="herdr-new-chat-label"
          aria-expanded={isOpen}
          aria-controls="new-chat-options"
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          placeholder={t("Search or create a Bot")}
          value={draft.query}
          onFocus={() => setIsOpen(true)}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          // A click on an option row fires mousedown before this input's blur; the row's own
          // onMouseDown calls preventDefault so blur never fires ahead of the click (see NewChatDialog.tsx).
          onBlur={() => setIsOpen(false)}
        />
      </div>
      {draft.mode === "group" ? <SandButton className="herdr-new-chat-submit" disabled={!canSubmitGroup} onClick={onCreateGroup} size="sm">{t("Start chat")}</SandButton> : null}
      <SandIconButton aria-label={t("Cancel")} className="herdr-new-chat-close" icon="x" label={t("Cancel")} onClick={onCancel} size="sm" title={t("Cancel")} />
    </div>
    {isOpen && options.length > 0 ? <div className="herdr-new-chat-dropdown" id="new-chat-options" role="listbox">
      {options.map((option, index) => {
        const isActive = index === activeIndex;
        return <div
          aria-disabled={option.kind === "create-bot" && pending ? true : undefined}
          aria-selected={isActive}
          className="herdr-new-chat-option"
          data-active={isActive || undefined}
          id={`herdr-new-chat-option-${index}`}
          key={optionKey(option)}
          onMouseDown={event => { event.preventDefault(); selectOption(option); }}
          role="option"
        >
          <span className="herdr-new-chat-option__icon" data-kind={option.kind}>{optionLeading(option)}</span>
          <span className="herdr-new-chat-option__label">{optionLabel(option)}</span>
          {index < SHORTCUT_ROWS ? <span aria-hidden className="herdr-new-chat-option__kbd"><kbd>⌘</kbd><kbd>{index + 1}</kbd></span> : null}
        </div>;
      })}
    </div> : null}
    {error == null ? null : <p className="herdr-new-chat-error" role="alert">{error}</p>}
  </div>;
}
