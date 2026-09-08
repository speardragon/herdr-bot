// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2750022 (c3n AvatarEditor bridge boundary; SHA256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=3497738 (c3n AvatarEditor bridge boundary; SHA256 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5)

import type { DesktopBridge } from "../../../contracts/desktop-bridge";
import type { RawPortCoordinatorSource } from "../../../runtime/coordinator-source";
import {
  createAvatarEditorController,
  type AvatarEditorAgent,
  type AvatarEditorController,
} from "./controller";
import type { AvatarImageCodec } from "./model";

export interface AvatarEditorProductionScope {
  /** Renderer-only identity fence; it is never sent through the avatar RPC. */
  readonly accountKey: string | null;
  readonly agent: AvatarEditorAgent | null;
}

export type AvatarEditorProductionStatus = "ready" | "signed-out" | "missing-agent" | "bridge-unavailable";

export interface AvatarEditorProductionSnapshot {
  readonly accountKey: string | null;
  readonly agentId: string | null;
  readonly generation: number;
  readonly status: AvatarEditorProductionStatus;
  readonly controller: AvatarEditorController | null;
}

export interface AvatarEditorProductionAdapter {
  getSnapshot(): AvatarEditorProductionSnapshot;
  subscribe(listener: () => void): () => void;
  setScope(scope: AvatarEditorProductionScope): void;
  /** Invalidates the current controller and recreates the same scoped leaf. */
  reset(): void;
  dispose(): void;
}

export interface AvatarEditorProductionAdapterOptions {
  readonly desktop: Pick<DesktopBridge, "pickAvatarFile" | "generateAgentAvatarImage">;
  readonly source: Pick<RawPortCoordinatorSource, "setAgentAvatarBytes" | "updateAgent">;
  readonly codec?: AvatarImageCodec;
}

function callable(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === "function";
}

function validScope(scope: AvatarEditorProductionScope): boolean {
  return typeof scope.accountKey === "string" && scope.accountKey.length > 0
    && scope.agent != null && typeof scope.agent.id === "string" && scope.agent.id.length > 0;
}

export function createAvatarEditorProductionAdapter(options: AvatarEditorProductionAdapterOptions): AvatarEditorProductionAdapter {
  let scope: AvatarEditorProductionScope = { accountKey: null, agent: null };
  let generation = 0;
  let disposed = false;
  let controller: AvatarEditorController | null = null;
  let status: AvatarEditorProductionStatus = "signed-out";
  let snapshot: AvatarEditorProductionSnapshot = {
    accountKey: null,
    agentId: null,
    generation: 0,
    status,
    controller: null,
  };
  const listeners = new Set<() => void>();

  const emit = (): void => {
    if (disposed) return;
    for (const listener of [...listeners]) listener();
  };
  const disposeController = (): void => {
    controller?.dispose();
    controller = null;
  };
  const rebuild = (next: AvatarEditorProductionScope): void => {
    disposeController();
    generation += 1;
    scope = next;
    if (next.accountKey == null) status = "signed-out";
    else if (!validScope(next)) status = "missing-agent";
    else if (next.agent == null) status = "missing-agent";
    else if (!callable(options.desktop.pickAvatarFile)
      || !callable(options.desktop.generateAgentAvatarImage)
      || !callable(options.source.setAgentAvatarBytes)
      || !callable(options.source.updateAgent)) status = "bridge-unavailable";
    else {
      status = "ready";
      const agent = next.agent;
      controller = createAvatarEditorController({
        agent,
        desktop: options.desktop,
        roster: {
          setAgentAvatarBytes: (args, requestOptions) => options.source.setAgentAvatarBytes(args, requestOptions),
          updateAgent: (args) => options.source.updateAgent(args),
        },
        codec: options.codec,
      });
    }
    snapshot = {
      accountKey: scope.accountKey,
      agentId: scope.agent?.id ?? null,
      generation,
      status,
      controller,
    };
    emit();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setScope(next) {
      if (disposed) return;
      if (scope.accountKey === next.accountKey
        && scope.agent?.id === next.agent?.id
        && scope.agent?.isGroup === next.agent?.isGroup
        && scope.agent?.avatarDataUrl === next.agent?.avatarDataUrl
        && scope.agent?.avatarShape === next.agent?.avatarShape
        && scope.agent?.avatarColor === next.agent?.avatarColor) return;
      rebuild(next);
    },
    reset() {
      if (disposed) return;
      rebuild(scope);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      disposeController();
      snapshot = {
        accountKey: scope.accountKey,
        agentId: scope.agent?.id ?? null,
        generation,
        status,
        controller: null,
      };
      listeners.clear();
    },
  };
}
