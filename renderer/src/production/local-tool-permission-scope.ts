export interface LocalToolPermissionScopeGate {
  enter(scope: string | null): void;
  accepts(scope: string, revision: number): boolean;
  reset(): void;
  dispose(): void;
}

/**
 * Fences permission rows across account/logout replacement. A re-entered
 * account must publish a strictly newer authoritative revision, while rows
 * from the active revision may continue to represent multiple requests.
 */
export function createLocalToolPermissionScopeGate(): LocalToolPermissionScopeGate {
  let activeScope: string | null = null;
  let activeRevision: number | null = null;
  let reentryFloor: number | null = null;
  let disposed = false;
  const highestRevisionByScope = new Map<string, number>();

  return {
    enter(scope) {
      if (disposed || activeScope === scope) return;
      if (activeScope != null && activeRevision != null) {
        highestRevisionByScope.set(activeScope, Math.max(highestRevisionByScope.get(activeScope) ?? -Infinity, activeRevision));
      }
      activeScope = scope;
      activeRevision = null;
      reentryFloor = scope == null ? null : highestRevisionByScope.get(scope) ?? null;
    },
    accepts(scope, revision) {
      if (disposed || activeScope !== scope || !Number.isInteger(revision) || revision < 0) return false;
      if (activeRevision == null) {
        if (reentryFloor != null && revision <= reentryFloor) return false;
        activeRevision = revision;
        reentryFloor = null;
        highestRevisionByScope.set(scope, Math.max(highestRevisionByScope.get(scope) ?? -Infinity, revision));
        return true;
      }
      if (revision < activeRevision) return false;
      if (revision > activeRevision) {
        activeRevision = revision;
        highestRevisionByScope.set(scope, Math.max(highestRevisionByScope.get(scope) ?? -Infinity, revision));
      }
      return true;
    },
    reset() {
      if (disposed) return;
      activeScope = null;
      activeRevision = null;
      reentryFloor = null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      activeScope = null;
      activeRevision = null;
      reentryFloor = null;
      highestRevisionByScope.clear();
    }
  };
}
