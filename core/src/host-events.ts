import { log } from "./log.ts";

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

  /** Never throws: a listener that throws is logged and skipped so every other listener still runs. */
  emit(family: HostEventFamily, payload: unknown): void {
    for (const listener of [...(this.#listeners.get(family) ?? [])]) {
      try {
        listener(payload);
      } catch (error) {
        log("events", `listener for "${family}" threw`, error instanceof Error ? error.message : String(error));
      }
    }
  }
}
