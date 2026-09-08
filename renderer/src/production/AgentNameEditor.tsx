import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { committedAgentName } from "./agent-name-editor-model";

// Inline agent rename editor recovered from yut/udn.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L51916

export interface AgentNameEditorProps {
  initialValue: string;
  onCommit(value: string): void;
  onExit(): void;
}

export function AgentNameEditor({ initialValue, onCommit, onExit }: AgentNameEditorProps) {
  const [draft, setDraft] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const finish = (shouldCommit: boolean, value: string) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (shouldCommit) {
      const committed = committedAgentName(initialValue, value);
      if (committed != null) onCommit(committed);
    }
    onExit();
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    finish(!cancelRef.current, event.currentTarget.value);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelRef.current = true;
      event.currentTarget.blur();
    }
  };

  return <input
    aria-label="Rename agent"
    autoComplete="off"
    className="sand-agent-item__name-input"
    data-initial={initialValue}
    onBlur={handleBlur}
    onChange={(event) => setDraft(event.currentTarget.value)}
    onClick={(event) => event.stopPropagation()}
    onDoubleClick={(event) => event.stopPropagation()}
    onKeyDown={handleKeyDown}
    onMouseDown={(event) => event.stopPropagation()}
    ref={inputRef}
    spellCheck={false}
    value={draft}
  />;
}
