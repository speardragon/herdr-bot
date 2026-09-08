// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2750022 (c3n AvatarEditor lifecycle and bridge actions; SHA256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=3497738 (c3n AvatarEditor lifecycle and bridge actions; SHA256 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5)

import type { AvatarFileSelection, DesktopBridge } from "../../../contracts/desktop-bridge";
import {
  browserAvatarImageCodec,
  clampAvatarCrop,
  initialAvatarCrop,
  panAvatarCrop,
  type AvatarCharacter,
  type AvatarCrop,
  type AvatarImage,
  type AvatarImageCodec,
} from "./model";

export interface AvatarEditorAgent {
  readonly id: string;
  readonly isGroup: boolean;
  readonly avatarDataUrl?: string | null;
  readonly avatarShape?: string | null;
  readonly avatarColor?: string | null;
}

export interface AvatarEditorRoster {
  setAgentAvatarBytes(args: { readonly id: string; readonly pngBase64: string | null }, options?: { readonly signal?: unknown }): Promise<unknown>;
  updateAgent?(args: { readonly id: string; readonly avatarShape?: string; readonly avatarColor?: string }): Promise<unknown>;
}

export interface AvatarEditorSnapshot {
  readonly agentId: string;
  readonly source: AvatarImage | null;
  readonly crop: AvatarCrop | null;
  readonly fileName: string | null;
  readonly hasExistingAvatar: boolean;
  readonly persistedCharacter: AvatarCharacter;
  readonly stagedCharacter: AvatarCharacter | null;
  readonly mode: "bot" | "generate" | "upload";
  readonly isGenerating: boolean;
  readonly isSaving: boolean;
  readonly isCommitting: boolean;
  readonly error: string | null;
  readonly generation: number;
}

export interface AvatarEditorController {
  getSnapshot(): AvatarEditorSnapshot;
  subscribe(listener: () => void): () => void;
  setOpen(open: boolean): void;
  setMode(mode: AvatarEditorSnapshot["mode"]): void;
  pickFile(): Promise<boolean>;
  ingestFile(file: File): Promise<boolean>;
  pasteFile(file: File): Promise<boolean>;
  generate(description: string): Promise<boolean>;
  setZoom(zoom: number): void;
  pan(deltaX: number, deltaY: number): void;
  resetCrop(): void;
  save(): Promise<boolean>;
  clearAvatar(): Promise<boolean>;
  stageCharacter(patch: Partial<AvatarCharacter>): Promise<boolean>;
  commitStagedCharacter(): Promise<boolean>;
  resetCharacter(): Promise<boolean>;
  updateCharacter(patch: { readonly avatarShape?: string; readonly avatarColor?: string }): Promise<boolean>;
  dispose(): void;
}

export interface AvatarEditorControllerOptions {
  readonly agent: AvatarEditorAgent;
  readonly desktop: Pick<DesktopBridge, "pickAvatarFile" | "generateAgentAvatarImage">;
  readonly roster: AvatarEditorRoster;
  readonly codec?: AvatarImageCodec;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createAvatarEditorController(options: AvatarEditorControllerOptions): AvatarEditorController {
  const codec = options.codec ?? browserAvatarImageCodec;
  let snapshot: AvatarEditorSnapshot = {
    agentId: options.agent.id,
    source: null,
    crop: null,
    fileName: null,
    hasExistingAvatar: typeof options.agent.avatarDataUrl === "string" && options.agent.avatarDataUrl.length > 0,
    persistedCharacter: { avatarShape: options.agent.avatarShape ?? null, avatarColor: options.agent.avatarColor ?? null },
    stagedCharacter: null,
    mode: options.agent.isGroup ? "upload" : "bot",
    isGenerating: false,
    isSaving: false,
    isCommitting: false,
    error: null,
    generation: 0,
  };
  let open = true;
  let disposed = false;
  let sequence = 0;
  let activeRequest: AbortController | null = null;
  const listeners = new Set<() => void>();
  const emit = (): void => { if (!disposed) for (const listener of [...listeners]) listener(); };
  const patch = (next: Partial<AvatarEditorSnapshot>): void => { if (!disposed) { snapshot = { ...snapshot, ...next }; emit(); } };
  const current = (token: number): boolean => !disposed && token === sequence;
  const loadDataUrl = async (dataUrl: string, fileName: string | null): Promise<boolean> => {
    const token = ++sequence;
    patch({ error: null, generation: token });
    try {
      const source = await codec.normalizeDataUrl(dataUrl);
      if (!current(token) || !open) return false;
      patch({ source, crop: initialAvatarCrop(source.width, source.height), fileName, stagedCharacter: null, error: null });
      return true;
    } catch (error) {
      if (current(token)) patch({ error: errorText(error), source: null, crop: null, fileName: null });
      return false;
    }
  };
  const saveEncoded = async (source: AvatarImage, crop: AvatarCrop, closeAfterSave: boolean): Promise<boolean> => {
    const token = sequence;
    const request = new AbortController();
    activeRequest = request;
    patch({ isSaving: true, error: null });
    try {
      const pngBase64 = await codec.encodePng(source, crop);
      if (!current(token)) return false;
      await options.roster.setAgentAvatarBytes({ id: options.agent.id, pngBase64 }, { signal: request.signal });
      if (!current(token)) return false;
      patch({ isSaving: false, hasExistingAvatar: true, stagedCharacter: null, error: null });
      if (closeAfterSave) open = false;
      return true;
    } catch (error) {
      if (current(token)) patch({ isSaving: false, error: errorText(error) });
      return false;
    } finally {
      if (activeRequest === request) activeRequest = null;
    }
  };
  const ingestFile = async (file: File): Promise<boolean> => {
    if (disposed) return false;
    try {
      return await loadDataUrl(await codec.readFile(file), file.name || "Pasted image");
    } catch (error) {
      patch({ error: errorText(error) });
      return false;
    }
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { if (disposed) return () => {}; listeners.add(listener); return () => listeners.delete(listener); },
    setOpen(next) { if (!disposed) open = next; },
    setMode(mode) { if (!disposed) patch({ mode, error: null }); },
    async pickFile() {
      if (disposed) return false;
      patch({ error: null });
      try {
        const selected: AvatarFileSelection | null = await options.desktop.pickAvatarFile();
        return selected == null ? false : loadDataUrl(selected.dataUrl, selected.fileName);
      } catch (error) { patch({ error: errorText(error) }); return false; }
    },
    ingestFile,
    pasteFile: ingestFile,
    async generate(description) {
      if (disposed) return false;
      const value = description.trim();
      if (value.length === 0 || snapshot.isGenerating) return false;
      const token = ++sequence;
      patch({ isGenerating: true, generation: token, error: null });
      try {
        const dataUrl = await options.desktop.generateAgentAvatarImage(value);
        const source = await codec.normalizeDataUrl(dataUrl);
        if (!current(token)) return false;
        if (!open) return saveEncoded(source, initialAvatarCrop(source.width, source.height), false);
        patch({ source, crop: initialAvatarCrop(source.width, source.height), fileName: null, stagedCharacter: null, isGenerating: false, error: null });
        return true;
      } catch (error) {
        if (current(token)) patch({ isGenerating: false, error: errorText(error) });
        return false;
      } finally {
        if (current(token) && snapshot.isGenerating) patch({ isGenerating: false });
      }
    },
    setZoom(zoom) { if (snapshot.source != null && snapshot.crop != null) patch({ crop: clampAvatarCrop(snapshot.source, { ...snapshot.crop, zoom }) }); },
    pan(deltaX, deltaY) { if (snapshot.source != null && snapshot.crop != null) patch({ crop: panAvatarCrop(snapshot.source, snapshot.crop, deltaX, deltaY) }); },
    resetCrop() {
      if (disposed) return;
      sequence += 1;
      patch({ source: null, crop: null, fileName: null, isGenerating: false, error: null, generation: sequence });
    },
    async save() {
      if (disposed || snapshot.source == null || snapshot.crop == null || snapshot.isSaving) return false;
      return saveEncoded(snapshot.source, snapshot.crop, true);
    },
    async clearAvatar() {
      if (disposed || snapshot.isSaving) return false;
      const token = ++sequence;
      const request = new AbortController();
      activeRequest = request;
      patch({ isSaving: true, error: null });
      try {
        await options.roster.setAgentAvatarBytes({ id: options.agent.id, pngBase64: null }, { signal: request.signal });
        if (!current(token)) return false;
        patch({ isSaving: false, source: null, crop: null, fileName: null, stagedCharacter: null, hasExistingAvatar: false, error: null, generation: token });
        return true;
      } catch (error) { if (current(token)) patch({ isSaving: false, error: errorText(error) }); return false; }
      finally { if (activeRequest === request) activeRequest = null; }
    },
    async stageCharacter(patchValue) {
      if (disposed || snapshot.isSaving || snapshot.isCommitting) return false;
      const nextCharacter = { ...snapshot.persistedCharacter, ...snapshot.stagedCharacter, ...patchValue };
      if (snapshot.hasExistingAvatar) {
        patch({ stagedCharacter: nextCharacter, error: null });
        return true;
      }
      if (options.roster.updateAgent == null) return false;
      patch({ isCommitting: true, error: null });
      try {
        await options.roster.updateAgent({ id: options.agent.id, avatarShape: nextCharacter.avatarShape ?? "", avatarColor: nextCharacter.avatarColor ?? "" });
        if (!disposed) patch({ persistedCharacter: nextCharacter, stagedCharacter: null, isCommitting: false, error: null });
        return true;
      } catch (error) {
        if (!disposed) patch({ isCommitting: false, error: errorText(error) });
        return false;
      }
    },
    async commitStagedCharacter() {
      if (disposed || snapshot.stagedCharacter == null || snapshot.isSaving || snapshot.isCommitting || options.roster.updateAgent == null) return false;
      const nextCharacter = snapshot.stagedCharacter;
      patch({ isCommitting: true, error: null });
      try {
        await options.roster.updateAgent({ id: options.agent.id, avatarShape: nextCharacter.avatarShape ?? "", avatarColor: nextCharacter.avatarColor ?? "" });
        if (snapshot.hasExistingAvatar) await options.roster.setAgentAvatarBytes({ id: options.agent.id, pngBase64: null });
        if (!disposed) patch({ persistedCharacter: nextCharacter, stagedCharacter: null, source: null, crop: null, fileName: null, hasExistingAvatar: false, isCommitting: false, error: null });
        return true;
      } catch (error) {
        if (!disposed) patch({ isCommitting: false, error: errorText(error) });
        return false;
      }
    },
    async resetCharacter() {
      if (disposed || snapshot.isSaving || snapshot.isCommitting || options.roster.updateAgent == null) return false;
      patch({ isCommitting: true, error: null });
      try {
        await options.roster.updateAgent({ id: options.agent.id, avatarShape: "", avatarColor: "" });
        if (!disposed) patch({ persistedCharacter: { avatarShape: null, avatarColor: null }, stagedCharacter: null, isCommitting: false, error: null });
        return true;
      } catch (error) {
        if (!disposed) patch({ isCommitting: false, error: errorText(error) });
        return false;
      }
    },
    async updateCharacter(patchValue) {
      return this.stageCharacter(patchValue);
    },
    dispose() { if (disposed) return; disposed = true; sequence += 1; activeRequest?.abort(); activeRequest = null; listeners.clear(); },
  };
}
