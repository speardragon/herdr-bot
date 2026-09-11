import { t } from "./locale";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { RendererAgent } from "./model";
import { OverlayDialog } from "../recovered/ui/overlay-primitives";
import { SandButton } from "../recovered/ui/sand-kit-primitives";
import { SandCheckbox, SandTabs, SandTextField, SandTextarea } from "../recovered/ui/sand-form-primitives";
import { SandSelect, type SandSelectOption } from "../recovered/ui/sand-floating-primitives";
import { rendererRuntimeAssetUrl } from "./runtime-assets";

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

export interface BotDefaults {
  readonly cwd: string;
  readonly kind: string;
}

export interface DirectoryListing {
  readonly exists: boolean;
  readonly entries: readonly string[];
}

export interface NewChatDialogProps {
  readonly open: boolean;
  readonly agents: readonly RendererAgent[];
  onClose(): void;
  onCreateBot(request: CreateBotRequest): Promise<void>;
  onCreateRoom(request: CreateRoomRequest): Promise<void>;
  listAdoptable(): Promise<AdoptableAgent[]>;
  getDefaults(): Promise<BotDefaults>;
  listDirectories(path: string): Promise<DirectoryListing>;
}

/**
 * Label, badge colour, and (where one exists) real brand mark for the agent kinds offered in the
 * New Bot dialog. Icons are Simple Icons (CC0 1.0 licensed glyphs; see renderer/UPSTREAM.md) --
 * xAI has no mark there yet, so Grok keeps a plain monogram.
 */
const KIND_META = [
  { value: "claude", label: "Claude Code", letter: "C", color: "#D97757", icon: "claude" },
  { value: "codex", label: "Codex", letter: "X", color: "#10A37F", icon: "codex" },
  { value: "grok", label: "Grok CLI", letter: "G", color: "#1C1C1C", icon: null },
  { value: "gemini", label: "Gemini CLI", letter: "G", color: "#4285F4", icon: "gemini" },
  { value: "opencode", label: "OpenCode", letter: "O", color: "#6E56CF", icon: "opencode" },
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

/** The dialog never asks for an id; it derives one from the name and, on collision, appends -2, -3, ... */
function uniqueBotId(name: string, takenIds: ReadonlySet<string>): string {
  const base = suggestBotId(name);
  if (!takenIds.has(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base.slice(0, 32 - String(suffix).length - 1)}-${suffix}`;
    if (!takenIds.has(candidate)) return candidate;
  }
  return base;
}

function KindBadge({ letter, color, icon }: { readonly letter: string; readonly color: string; readonly icon: string | null }) {
  if (icon == null) return <span aria-hidden="true" className="sand-kind-badge" style={{ background: color }}>{letter}</span>;
  const url = rendererRuntimeAssetUrl(`agent-kinds/${icon}.svg`);
  return <span aria-hidden="true" className="sand-kind-badge" style={{ background: color }}><span className="sand-kind-badge__icon" style={{ "--kind-icon": `url(${url})` } as CSSProperties} /></span>;
}

export function NewChatDialog({ open, agents, onClose, onCreateBot, onCreateRoom, listAdoptable, getDefaults, listDirectories }: NewChatDialogProps) {
  const [tab, setTab] = useState<"bot" | "room">("bot");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<string>("claude");
  const [cwd, setCwd] = useState("");
  const [cwdSuggestions, setCwdSuggestions] = useState<readonly string[]>([]);
  const [cwdExists, setCwdExists] = useState(true);
  const [cwdMenuOpen, setCwdMenuOpen] = useState(false);
  const [permissionMode, setPermissionMode] = useState<"ask" | "auto">("ask");
  const [source, setSource] = useState<string>(SPAWN);
  const [adoptable, setAdoptable] = useState<AdoptableAgent[]>([]);
  const [roomName, setRoomName] = useState("");
  const [roomGoal, setRoomGoal] = useState("");
  const [members, setMembers] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cwdRequestGeneration = useRef(0);

  useEffect(() => {
    if (!open) return;
    setTab("bot"); setName(""); setDescription(""); setKind("claude"); setCwd("");
    setCwdSuggestions([]); setCwdExists(true); setCwdMenuOpen(false);
    setPermissionMode("ask"); setSource(SPAWN); setRoomName(""); setRoomGoal(""); setMembers(new Set()); setError(null); setPending(false);
    let cancelled = false;
    listAdoptable().then(
      (list) => { if (!cancelled) setAdoptable(list); },
      () => { if (!cancelled) setAdoptable([]); },
    );
    getDefaults().then(
      (defaults) => { if (!cancelled) { setCwd(defaults.cwd); setKind(defaults.kind); } },
      () => {},
    );
    return () => { cancelled = true; };
  }, [open, listAdoptable, getDefaults]);

  useEffect(() => {
    if (!open) return;
    const generation = ++cwdRequestGeneration.current;
    listDirectories(cwd).then(
      (listing) => { if (cwdRequestGeneration.current === generation) { setCwdExists(listing.exists); setCwdSuggestions(listing.entries); } },
      () => { if (cwdRequestGeneration.current === generation) { setCwdExists(false); setCwdSuggestions([]); } },
    );
  }, [open, cwd, listDirectories]);

  const takenIds = useMemo(() => new Set(agents.map((agent) => agent.id)), [agents]);
  const effectiveId = useMemo(() => uniqueBotId(name, takenIds), [name, takenIds]);
  const bots = useMemo(() => agents.filter((agent) => !agent.isGroup), [agents]);
  const sourceOptions = useMemo(() => [
    { value: SPAWN, label: t("Start a new agent in herdr") },
    ...adoptable.map((agent) => ({ value: agent.pane_id, label: `Adopt ${agent.agent ?? "agent"} at ${agent.pane_id}${agent.cwd ? ` (${agent.cwd})` : ""}` })),
  ], [adoptable]);
  const kindOptions: SandSelectOption<string>[] = useMemo(() => KIND_META.map((meta) => ({
    value: meta.value, label: meta.label, leading: <KindBadge color={meta.color} icon={meta.icon} letter={meta.letter} />,
  })), []);
  const canCreateBot = name.trim().length > 0 && (source !== SPAWN || cwdExists) && !pending;
  const canCreateRoom = roomName.trim().length > 0 && members.size > 0 && members.size <= 6 && !pending;

  const submit = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      if (tab === "bot") {
        await onCreateBot({ id: effectiveId, name: name.trim(), description, kind, cwd: cwd.trim(), permissionMode, ...(source === SPAWN ? {} : { adoptPaneId: source }) });
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

  return <OverlayDialog className="sand-new-chat-dialog" label={t("New")} onClose={onClose} open={open} panelStyle={{ width: "min(520px, calc(100% - 32px))", padding: 20 }}>
    <h2 className="sand-new-chat-dialog__title">{t("New")}</h2>
    <SandTabs ariaLabel={t("What to create")} items={TABS.map((item) => ({ id: item.id, label: t(item.label) }))} onValueChange={(value) => setTab(value === "room" ? "room" : "bot")} value={tab} />
    {tab === "bot" ? <div className="sand-new-chat-dialog__form">
      <SandTextField autoFocus label={t("Name")} onChange={(event) => setName(event.currentTarget.value)} placeholder={t("Code Reviewer")} value={name} />
      <SandTextarea label={t("Persona (optional)")} minRows={2} onChange={(event) => setDescription(event.currentTarget.value)} placeholder={t("Reviews diffs for correctness and style.")} value={description} />
      {sourceOptions.length > 1 ? <label className="sand-new-chat-dialog__row"><span>{t("Source")}</span><SandSelect ariaLabel={t("Source")} className="ui-select-trigger" matchAnchorWidth onValueChange={setSource} options={sourceOptions} value={source} /></label> : null}
      {source === SPAWN ? <>
        <label className="sand-new-chat-dialog__row"><span>{t("Agent")}</span><SandSelect ariaLabel={t("Agent kind")} className="ui-select-trigger" onValueChange={setKind} options={kindOptions} value={kind} /></label>
        <div className="sand-new-chat-dialog__cwd">
          <SandTextField
            description={cwd.trim().length > 0 && !cwdExists ? undefined : "Where the agent's shell starts"}
            error={cwd.trim().length > 0 && !cwdExists ? "No such directory" : undefined}
            label={t("Working directory")}
            mono
            onBlur={() => setTimeout(() => setCwdMenuOpen(false), 120)}
            onChange={(event) => { setCwd(event.currentTarget.value); setCwdMenuOpen(true); }}
            onFocus={() => setCwdMenuOpen(true)}
            value={cwd}
          />
          {cwdMenuOpen && cwdSuggestions.length > 0 ? <div className="ui-menu__content sand-new-chat-dialog__cwd-menu" role="listbox">
            <div className="ui-menu__layout">
              {cwdSuggestions.map((entry) => <div className="ui-menu__row" data-component="select-item" key={entry} onMouseDown={(event) => { event.preventDefault(); setCwd(entry); setCwdMenuOpen(false); }} role="option" tabIndex={-1}>{entry}</div>)}
            </div>
          </div> : null}
        </div>
        <label className="sand-new-chat-dialog__row"><span>{t("Permissions")}</span><SandSelect ariaLabel={t("Permissions")} className="ui-select-trigger" onValueChange={setPermissionMode} options={[{ value: "ask" as const, label: t("Ask before edits and commands") }, { value: "auto" as const, label: t("Agent-specific automation permissions") }]} value={permissionMode} /></label>
      </> : null}
    </div> : <div className="sand-new-chat-dialog__form">
      <SandTextField autoFocus label={t("Room name")} onChange={(event) => setRoomName(event.currentTarget.value)} placeholder={t("Auth refactor")} value={roomName} />
      <SandTextarea label={t("Goal (optional)")} minRows={2} onChange={(event) => setRoomGoal(event.currentTarget.value)} placeholder={t("Ship the login fix with tests and a changelog entry.")} value={roomGoal} />
      <fieldset className="sand-new-chat-dialog__members">
        <legend>{t("Members")} ({members.size}/6)</legend>
        {bots.length === 0 ? <p>{t("Create a bot first.")}</p> : bots.map((bot) => <SandCheckbox checked={members.has(bot.id)} key={bot.id} label={`${bot.name} (@${bot.id})`} onCheckedChange={(checked) => setMembers((current) => { const next = new Set(current); if (checked) next.add(bot.id); else next.delete(bot.id); return next; })} />)}
      </fieldset>
    </div>}
    {error == null ? null : <p className="sand-new-chat-dialog__error" role="alert">{error}</p>}
    <footer className="sand-new-chat-dialog__footer">
      <SandButton disabled={pending} onClick={onClose} size="sm" variant="secondary">{t("Cancel")}</SandButton>
      <SandButton disabled={tab === "bot" ? !canCreateBot : !canCreateRoom} onClick={() => void submit()} size="sm">{pending ? t("Creating…") : tab === "bot" ? (source === SPAWN ? t("Start bot") : t("Adopt bot")) : t("Create room")}</SandButton>
    </footer>
  </OverlayDialog>;
}
