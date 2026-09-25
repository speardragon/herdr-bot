import { t } from "./locale";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { RendererAgent } from "./model";
import { OverlayDialog } from "../recovered/ui/overlay-primitives";
import { SandButton } from "../recovered/ui/sand-kit-primitives";
import { SandCheckbox, SandTabs, SandTextField, SandTextarea } from "../recovered/ui/sand-form-primitives";
import { SandSelect, type SandSelectOption } from "../recovered/ui/sand-floating-primitives";
import { rendererRuntimeAssetUrl } from "./runtime-assets";
import {
  buildCreateBotRequest,
  SPAWN_SOURCE,
  supportsModelSelection,
  supportsReasoningEffort,
  type AdoptableAgent,
  type BotDefaults,
  type CreateBotRequest,
  type CreateRoomRequest,
  type DirectoryListing,
  type ModelCatalogResult,
  type ReasoningEffort,
} from "./new-chat-dialog-model";

export type {
  AdoptableAgent,
  BotDefaults,
  CreateBotRequest,
  CreateRoomRequest,
  DirectoryListing,
  ModelCatalogResult,
  ModelEntry,
  ModelCatalogSource,
  ReasoningEffort,
} from "./new-chat-dialog-model";
export { isValidBotId, suggestBotId } from "./new-chat-dialog-model";

export interface NewChatDialogProps {
  readonly open: boolean;
  readonly agents: readonly RendererAgent[];
  onClose(): void;
  onCreateBot(request: CreateBotRequest): Promise<void>;
  onCreateRoom(request: CreateRoomRequest): Promise<void>;
  listAdoptable(): Promise<AdoptableAgent[]>;
  getDefaults(): Promise<BotDefaults>;
  listDirectories(path: string): Promise<DirectoryListing>;
  /** Task 6's model catalog RPC (herdrBot.listModels), re-queried whenever the selected provider
   * changes while spawning a new agent. */
  listModels(kind: string): Promise<ModelCatalogResult>;
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

const DEFAULT_MODEL_VALUE = "__default__";
const CUSTOM_MODEL_VALUE = "__custom__";

/** `Default` maps to `null` (CLI default) -- see launch-args.ts's ReasoningEffort. */
const REASONING_LEVELS: readonly { readonly value: "default" | ReasoningEffort; readonly label: string }[] = [
  { value: "default", label: "Default" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "XHigh" },
  { value: "max", label: "Max" },
];

function KindBadge({ letter, color, icon }: { readonly letter: string; readonly color: string; readonly icon: string | null }) {
  if (icon == null) return <span aria-hidden="true" className="sand-kind-badge" style={{ background: color }}>{letter}</span>;
  const url = rendererRuntimeAssetUrl(`agent-kinds/${icon}.svg`);
  return <span aria-hidden="true" className="sand-kind-badge" style={{ background: color }}><span className="sand-kind-badge__icon" style={{ "--kind-icon": `url(${url})` } as CSSProperties} /></span>;
}

export function NewChatDialog({ open, agents, onClose, onCreateBot, onCreateRoom, listAdoptable, getDefaults, listDirectories, listModels }: NewChatDialogProps) {
  const [tab, setTab] = useState<"bot" | "room">("bot");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<string>("claude");
  const [cwd, setCwd] = useState("");
  const [cwdSuggestions, setCwdSuggestions] = useState<readonly string[]>([]);
  const [cwdExists, setCwdExists] = useState(true);
  const [cwdMenuOpen, setCwdMenuOpen] = useState(false);
  const [permissionMode, setPermissionMode] = useState<"ask" | "auto">("ask");
  const [source, setSource] = useState<string>(SPAWN_SOURCE);
  const [adoptable, setAdoptable] = useState<AdoptableAgent[]>([]);
  const [model, setModel] = useState<string | null>(null);
  const [useCustomModel, setUseCustomModel] = useState(false);
  const [customModelId, setCustomModelId] = useState("");
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort | null>(null);
  const [modelCatalog, setModelCatalog] = useState<ModelCatalogResult | null>(null);
  const [roomName, setRoomName] = useState("");
  const [roomGoal, setRoomGoal] = useState("");
  const [members, setMembers] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cwdRequestGeneration = useRef(0);
  const modelCatalogGeneration = useRef(0);

  useEffect(() => {
    if (!open) return;
    setTab("bot"); setName(""); setDescription(""); setKind("claude"); setCwd("");
    setCwdSuggestions([]); setCwdExists(true); setCwdMenuOpen(false);
    setPermissionMode("ask"); setSource(SPAWN_SOURCE); setRoomName(""); setRoomGoal(""); setMembers(new Set()); setError(null); setPending(false);
    setModel(null); setUseCustomModel(false); setCustomModelId(""); setReasoningEffort(null); setModelCatalog(null);
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

  // herdr-bot (Task 7): re-fetch the model catalog whenever the provider changes, and reset the
  // previous provider's selected model/reasoning -- the plan's "프로바이더가 바뀌면 herdrBot.listModels
  // 재조회 및 이전 프로바이더의 선택 모델 초기화". Only relevant while spawning a new agent: adopting a
  // pane hides this whole section (see the JSX below) and keeps that pane's existing settings.
  useEffect(() => {
    if (!open || source !== SPAWN_SOURCE) return;
    setModel(null); setUseCustomModel(false); setCustomModelId(""); setReasoningEffort(null);
    if (!supportsModelSelection(kind)) { setModelCatalog(null); return; }
    const generation = ++modelCatalogGeneration.current;
    listModels(kind).then(
      (result) => { if (modelCatalogGeneration.current === generation) setModelCatalog(result); },
      // The RPC call itself rejected (transport/IPC failure) -- distinct from a normal
      // `{source: "unavailable"}` response, which already carries its own `error` text from
      // core/src/bots/model-catalog.ts. Without an `error` here the dialog would silently fall
      // back to just the custom-model-ID input with no explanation.
      (cause) => { if (modelCatalogGeneration.current === generation) setModelCatalog({ models: [], source: "unavailable", error: cause instanceof Error ? cause.message : String(cause) }); },
    );
  }, [open, kind, source, listModels]);

  const takenIds = useMemo(() => new Set(agents.map((agent) => agent.id)), [agents]);
  const bots = useMemo(() => agents.filter((agent) => !agent.isGroup), [agents]);
  const sourceOptions = useMemo(() => [
    { value: SPAWN_SOURCE, label: t("Start a new agent in herdr") },
    ...adoptable.map((agent) => ({ value: agent.pane_id, label: `Adopt ${agent.agent ?? "agent"} at ${agent.pane_id}${agent.cwd ? ` (${agent.cwd})` : ""}` })),
  ], [adoptable]);
  const kindOptions: SandSelectOption<string>[] = useMemo(() => KIND_META.map((meta) => ({
    value: meta.value, label: meta.label, leading: <KindBadge color={meta.color} icon={meta.icon} letter={meta.letter} />,
  })), []);
  const modelOptions: SandSelectOption<string>[] = useMemo(() => [
    { value: DEFAULT_MODEL_VALUE, label: t("CLI default") },
    ...(modelCatalog?.models ?? []).map((entry) => ({ value: entry.id, label: entry.label })),
    { value: CUSTOM_MODEL_VALUE, label: t("Custom model ID…", "직접 모델 ID 입력…") },
  ], [modelCatalog]);
  const modelSelectValue = useCustomModel ? CUSTOM_MODEL_VALUE : model ?? DEFAULT_MODEL_VALUE;
  const onModelSelectChange = (value: string) => {
    if (value === CUSTOM_MODEL_VALUE) { setUseCustomModel(true); return; }
    setUseCustomModel(false);
    setModel(value === DEFAULT_MODEL_VALUE ? null : value);
  };
  const canCreateBot = name.trim().length > 0 && (source !== SPAWN_SOURCE || cwdExists) && !pending;
  const canCreateRoom = roomName.trim().length > 0 && members.size > 0 && members.size <= 6 && !pending;

  const submit = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      if (tab === "bot") {
        const request = buildCreateBotRequest({
          name, description, kind, cwd, permissionMode,
          model: useCustomModel ? customModelId : model,
          reasoningEffort, source, takenIds,
        });
        await onCreateBot(request);
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
      {source === SPAWN_SOURCE ? <>
        <label className="sand-new-chat-dialog__row"><span>{t("AI provider", "AI 프로바이더")}</span><SandSelect ariaLabel={t("AI provider", "AI 프로바이더")} className="ui-select-trigger" onValueChange={setKind} options={kindOptions} value={kind} /></label>
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
        {supportsModelSelection(kind) ? <>
          <label className="sand-new-chat-dialog__row"><span>{t("Model")}</span><SandSelect ariaLabel={t("Model")} className="ui-select-trigger" onValueChange={onModelSelectChange} options={modelOptions} value={modelSelectValue} /></label>
          {useCustomModel ? <SandTextField label={t("Custom model ID", "직접 입력한 모델 ID")} onChange={(event) => setCustomModelId(event.currentTarget.value)} placeholder={t("e.g. gpt-5.4")} value={customModelId} /> : null}
          {modelCatalog?.error != null ? <p className="sand-new-chat-dialog__hint">{modelCatalog.error}</p> : null}
        </> : null}
        {supportsReasoningEffort(kind) ? <label className="sand-new-chat-dialog__row"><span>{t("Reasoning")}</span><SandSelect ariaLabel={t("Reasoning")} className="ui-select-trigger" onValueChange={(value) => setReasoningEffort(value === "default" ? null : value as ReasoningEffort)} options={REASONING_LEVELS.map((level) => ({ value: level.value, label: t(level.label) }))} value={reasoningEffort ?? "default"} /></label> : null}
      </> : <p className="sand-new-chat-dialog__hint">{t("Adopting an existing pane keeps its current model, reasoning, and permission settings -- they can't be changed here.", "기존 pane을 가져오면 현재 모델·추론·권한 설정이 그대로 유지되며 여기서 변경할 수 없습니다.")}</p>}
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
      <SandButton disabled={tab === "bot" ? !canCreateBot : !canCreateRoom} onClick={() => void submit()} size="sm">{pending ? t("Creating…") : tab === "bot" ? (source === SPAWN_SOURCE ? t("Start bot") : t("Adopt bot")) : t("Create room")}</SandButton>
    </footer>
  </OverlayDialog>;
}
