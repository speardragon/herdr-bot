import { useEffect, useMemo, useState } from "react";
import type { RendererAgent } from "./model";
import { OverlayDialog } from "../recovered/ui/overlay-primitives";
import { SandButton } from "../recovered/ui/sand-kit-primitives";
import { SandCheckbox, SandTabs, SandTextField, SandTextarea } from "../recovered/ui/sand-form-primitives";
import { SandSelect } from "../recovered/ui/sand-floating-primitives";

export interface CreateBotRequest {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: string;
  readonly cwd: string;
  readonly permissionMode: "ask" | "auto";
  readonly adoptPaneId?: string;
}

export interface CreateRoomRequest {
  readonly name: string;
  readonly description: string;
  readonly memberIds: string[];
}

export interface AdoptableAgent {
  readonly pane_id: string;
  readonly agent: string | null;
  readonly cwd: string | null;
  readonly name: string | null;
}

export interface NewChatDialogProps {
  readonly open: boolean;
  readonly agents: readonly RendererAgent[];
  readonly defaultCwd: string;
  onClose(): void;
  onCreateBot(request: CreateBotRequest): Promise<void>;
  onCreateRoom(request: CreateRoomRequest): Promise<void>;
  listAdoptable(): Promise<AdoptableAgent[]>;
}

const KIND_OPTIONS = [
  { value: "claude", label: "Claude Code" },
  { value: "codex", label: "Codex" },
  { value: "grok", label: "Grok CLI" },
  { value: "gemini", label: "Gemini CLI" },
  { value: "opencode", label: "OpenCode" },
] as const;

const TABS = [{ id: "bot", label: "Bot" }, { id: "room", label: "Room" }] as const;
const SPAWN = "__spawn__";

export function suggestBotId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "").slice(0, 32).replace(/-+$/g, "");
  if (slug.length === 0) return "bot";
  return /^[a-z]/.test(slug) ? slug : `bot-${slug}`.slice(0, 32);
}

export function isValidBotId(id: string): boolean {
  return /^[a-z][a-z0-9_-]{0,31}$/.test(id) && !id.startsWith("room-");
}

export function NewChatDialog({ open, agents, defaultCwd, onClose, onCreateBot, onCreateRoom, listAdoptable }: NewChatDialogProps) {
  const [tab, setTab] = useState<"bot" | "room">("bot");
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<string>("claude");
  const [cwd, setCwd] = useState(defaultCwd);
  const [permissionMode, setPermissionMode] = useState<"ask" | "auto">("ask");
  const [source, setSource] = useState<string>(SPAWN);
  const [adoptable, setAdoptable] = useState<AdoptableAgent[]>([]);
  const [roomName, setRoomName] = useState("");
  const [roomGoal, setRoomGoal] = useState("");
  const [members, setMembers] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab("bot"); setName(""); setId(""); setIdTouched(false); setDescription(""); setKind("claude"); setCwd(defaultCwd);
    setPermissionMode("ask"); setSource(SPAWN); setRoomName(""); setRoomGoal(""); setMembers(new Set()); setError(null); setPending(false);
    listAdoptable().then(setAdoptable, () => setAdoptable([]));
  }, [open, defaultCwd, listAdoptable]);

  const effectiveId = idTouched ? id : suggestBotId(name);
  const bots = useMemo(() => agents.filter((agent) => !agent.isGroup), [agents]);
  const sourceOptions = useMemo(() => [
    { value: SPAWN, label: "Start a new agent in herdr" },
    ...adoptable.map((agent) => ({ value: agent.pane_id, label: `Adopt ${agent.agent ?? "agent"} at ${agent.pane_id}${agent.cwd ? ` (${agent.cwd})` : ""}` })),
  ], [adoptable]);
  const canCreateBot = name.trim().length > 0 && isValidBotId(effectiveId) && !pending;
  const canCreateRoom = roomName.trim().length > 0 && members.size > 0 && members.size <= 6 && !pending;

  const submit = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      if (tab === "bot") {
        await onCreateBot({ id: effectiveId, name: name.trim(), description, kind, cwd: cwd.trim() || defaultCwd, permissionMode, ...(source === SPAWN ? {} : { adoptPaneId: source }) });
      } else {
        await onCreateRoom({ name: roomName.trim(), description: roomGoal, memberIds: [...members] });
      }
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
    }
  };

  return <OverlayDialog className="sand-new-chat-dialog" label="New" onClose={onClose} open={open} panelStyle={{ width: "min(520px, calc(100% - 32px))", padding: 20 }}>
    <h2 className="sand-new-chat-dialog__title">New</h2>
    <SandTabs ariaLabel="What to create" items={TABS.map((item) => ({ id: item.id, label: item.label }))} onValueChange={(value) => setTab(value === "room" ? "room" : "bot")} value={tab} />
    {tab === "bot" ? <div className="sand-new-chat-dialog__form">
      <SandTextField autoFocus label="Name" onChange={(event) => setName(event.currentTarget.value)} placeholder="Code Reviewer" value={name} />
      <SandTextField description="herdr agent name: lowercase letters, digits, - and _" error={effectiveId.length > 0 && !isValidBotId(effectiveId) ? "Invalid id" : undefined} label="Id" onChange={(event) => { setIdTouched(true); setId(event.currentTarget.value); }} value={effectiveId} />
      <SandTextarea label="Persona (optional)" minRows={2} onChange={(event) => setDescription(event.currentTarget.value)} placeholder="Reviews diffs for correctness and style." value={description} />
      <label className="sand-new-chat-dialog__row"><span>Source</span><SandSelect ariaLabel="Source" className="ui-select-trigger" matchAnchorWidth onValueChange={setSource} options={sourceOptions} value={source} /></label>
      {source === SPAWN ? <>
        <label className="sand-new-chat-dialog__row"><span>Agent</span><SandSelect ariaLabel="Agent kind" className="ui-select-trigger" onValueChange={setKind} options={KIND_OPTIONS.map((option) => ({ value: option.value, label: option.label }))} value={kind} /></label>
        <SandTextField label="Working directory" mono onChange={(event) => setCwd(event.currentTarget.value)} value={cwd} />
        <label className="sand-new-chat-dialog__row"><span>Permissions</span><SandSelect ariaLabel="Permissions" className="ui-select-trigger" onValueChange={setPermissionMode} options={[{ value: "ask" as const, label: "Ask before edits and commands" }, { value: "auto" as const, label: "Auto (bypass permissions)" }]} value={permissionMode} /></label>
      </> : null}
    </div> : <div className="sand-new-chat-dialog__form">
      <SandTextField autoFocus label="Room name" onChange={(event) => setRoomName(event.currentTarget.value)} placeholder="Auth refactor" value={roomName} />
      <SandTextarea label="Goal (optional)" minRows={2} onChange={(event) => setRoomGoal(event.currentTarget.value)} placeholder="Ship the login fix with tests and a changelog entry." value={roomGoal} />
      <fieldset className="sand-new-chat-dialog__members">
        <legend>Members ({members.size}/6)</legend>
        {bots.length === 0 ? <p>Create a bot first.</p> : bots.map((bot) => <SandCheckbox checked={members.has(bot.id)} key={bot.id} label={`${bot.name} (@${bot.id})`} onCheckedChange={(checked) => setMembers((current) => { const next = new Set(current); if (checked) next.add(bot.id); else next.delete(bot.id); return next; })} />)}
      </fieldset>
    </div>}
    {error == null ? null : <p className="sand-new-chat-dialog__error" role="alert">{error}</p>}
    <footer className="sand-new-chat-dialog__footer">
      <SandButton disabled={pending} onClick={onClose} size="sm" variant="secondary">Cancel</SandButton>
      <SandButton disabled={tab === "bot" ? !canCreateBot : !canCreateRoom} onClick={() => void submit()} size="sm">{pending ? "Creating…" : tab === "bot" ? (source === SPAWN ? "Start bot" : "Adopt bot") : "Create room"}</SandButton>
    </footer>
  </OverlayDialog>;
}
