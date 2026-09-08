export type HostEventFamily = "agents" | "agent-upserted" | "transcript";

type Listener = (payload: unknown) => void;

export class HostEvents {
  readonly #listeners = new Map<HostEventFamily, Set<Listener>>();

  on(family: HostEventFamily, listener: Listener): () => void {
    const set = this.#listeners.get(family) ?? new Set<Listener>();
    set.add(listener);
    this.#listeners.set(family, set);
    return () => {
      set.delete(listener);
    };
  }

  emit(family: HostEventFamily, payload: unknown): void {
    for (const listener of [...(this.#listeners.get(family) ?? [])]) listener(payload);
  }
}
