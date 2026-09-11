import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { t } from "./locale";
import { AgentAvatar } from "../recovered/features/conversation/workspace/agent-avatar";
import { SandButton } from "../recovered/ui/sand-kit-primitives";
import {
  activeOption,
  buildOptionList,
  canCreateGroup,
  moveActiveIndex,
  selectedMembers,
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
  onCreateBot(): void;
  onCreateGroup(): void;
  onOpenBot(id: string): void;
  onCancel(): void;
  /** Bumped by the root shell when the user presses "+" while this draft already exists -- refocuses
   * the input instead of creating a second draft (the root shell owns the "at most one draft" rule). */
  readonly focusSignal?: number;
}

/**
 * Header-based replacement for the New Chat modal (herdr-bot Task 5). Presentational only -- all
 * option composition, keyboard-navigation math, and default-name logic live in new-chat-model.ts
 * (see new-chat-header.test.ts) so they are testable without a DOM harness. This component owns
 * just the open/active-index UI state and wires it to those functions.
 */
export function NewChatHeader({ draft, candidates, pending, error, onChange, onCreateBot, onCreateGroup, onOpenBot, onCancel, focusSignal }: NewChatHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, [focusSignal]);

  const options = useMemo<readonly NewChatOption<NewChatHeaderBot>[]>(() => buildOptionList(draft, candidates), [draft, candidates]);
  const selectedBots = useMemo(() => selectedMembers(draft, candidates), [draft, candidates]);
  const canSubmitGroup = canCreateGroup(draft) && !pending;

  const setQuery = (query: string) => onChange({ ...draft, query });

  const removeMember = (id: string) => {
    onChange({ ...draft, memberIds: draft.memberIds.filter(memberId => memberId !== id) });
    inputRef.current?.focus();
  };

  const enterGroupMode = () => {
    onChange({ ...draft, mode: "group", query: "" });
    setIsOpen(true);
    inputRef.current?.focus();
  };

  const selectOption = (option: NewChatOption<NewChatHeaderBot>) => {
    if (option.kind === "create-bot") { if (!pending) onCreateBot(); return; }
    if (option.kind === "create-group") { enterGroupMode(); return; }
    if (draft.mode === "group") {
      if (draft.memberIds.includes(option.bot.id) || draft.memberIds.length >= 6) return;
      onChange({ ...draft, memberIds: [...draft.memberIds, option.bot.id], query: "" });
      inputRef.current?.focus();
      return;
    }
    setIsOpen(false);
    onOpenBot(option.bot.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
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
    <div className="herdr-new-chat-combobox">
      {selectedBots.map(bot => <span className="herdr-member-chip" key={bot.id}>
        <AgentAvatar agentId={bot.id} name={bot.name} size="sm" isStatic dataUrl={bot.avatarDataUrl} shape={bot.avatarShape} color={bot.avatarColor} />
        <span>{bot.name}</span>
        <button type="button" aria-label={`${bot.name} ${t("Remove")}`} onClick={() => removeMember(bot.id)}>×</button>
      </span>)}
      <input
        ref={inputRef}
        role="combobox"
        aria-label={t("Search or create a Bot")}
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
    {isOpen && options.length > 0 ? <div className="herdr-new-chat-dropdown" id="new-chat-options" role="listbox">
      {options.map((option, index) => {
        const id = `herdr-new-chat-option-${index}`;
        const isActive = index === activeIndex;
        if (option.kind === "create-bot") return <div aria-disabled={pending || undefined} aria-selected={isActive} className="herdr-new-chat-option" data-active={isActive || undefined} id={id} key="create-bot" onMouseDown={event => { event.preventDefault(); selectOption(option); }} role="option">{t("Create a new Bot")}</div>;
        if (option.kind === "create-group") return <div aria-selected={isActive} className="herdr-new-chat-option" data-active={isActive || undefined} id={id} key="create-group" onMouseDown={event => { event.preventDefault(); selectOption(option); }} role="option">{t("Create a group chat")}</div>;
        return <div aria-selected={isActive} className="herdr-new-chat-option" data-active={isActive || undefined} id={id} key={option.bot.id} onMouseDown={event => { event.preventDefault(); selectOption(option); }} role="option">
          <AgentAvatar agentId={option.bot.id} name={option.bot.name} size="sm" isStatic dataUrl={option.bot.avatarDataUrl} shape={option.bot.avatarShape} color={option.bot.avatarColor} />
          <span>{option.bot.name}</span>
        </div>;
      })}
    </div> : null}
    {draft.mode === "group" ? <SandButton disabled={!canSubmitGroup} onClick={onCreateGroup} size="sm">{t("Start chat")}</SandButton> : null}
    <button aria-label={t("Cancel")} className="herdr-new-chat-cancel" onClick={onCancel} type="button">{t("Cancel")}</button>
    {error == null ? null : <p className="herdr-new-chat-error" role="alert">{error}</p>}
  </div>;
}
