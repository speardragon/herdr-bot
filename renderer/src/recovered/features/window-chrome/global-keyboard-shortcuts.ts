// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5468071-5468840
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5484054-5485200
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5496605-5497600

export type GlobalShortcutId =
  | "sand.commandPalette"
  | "sand.focusSearch"
  | "sand.newAgent"
  | "sand.openSettings"
  | "sand.openTools"
  | "sand.focusInput"
  | "sand.findInChat"
  | "sand.previousAgent"
  | "sand.nextAgent"
  | "sand.navigateBack"
  | "sand.navigateForward"
  | "sand.toggleSidebar"
  | `sand.focusAgent${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;

export interface GlobalShortcutAction {
  readonly id: GlobalShortcutId;
  readonly label: string;
  readonly hotkey: string;
  readonly isEnabledInContentEditable?: boolean;
  readonly run: () => void | Promise<unknown>;
}

export interface GlobalShortcutHandlers {
  readonly toggleCommandPalette: () => void;
  readonly openSearch: () => void;
  readonly newAgent: () => void | Promise<unknown>;
  readonly openSettings: () => void;
  readonly openTools: () => void;
  readonly focusPrompt: () => void;
  readonly findInChat?: () => void;
  readonly previousAgent: () => void;
  readonly nextAgent: () => void;
  readonly navigateBack: () => void;
  readonly navigateForward: () => void;
  readonly focusAgent: (index: number) => void;
  readonly toggleSidebar: () => void;
}

/** The action order is the shipped global registry order for these root actions. */
export function createRootShellShortcutActions(handlers: GlobalShortcutHandlers): readonly GlobalShortcutAction[] {
  const actions: GlobalShortcutAction[] = [
    { id: "sand.newAgent", label: "New Bot", hotkey: "mod+n", isEnabledInContentEditable: true, run: handlers.newAgent },
    { id: "sand.commandPalette", label: "Jump to", hotkey: "mod+k", isEnabledInContentEditable: true, run: handlers.toggleCommandPalette },
    { id: "sand.openSettings", label: "Open settings", hotkey: "mod+comma", isEnabledInContentEditable: true, run: handlers.openSettings },
    { id: "sand.openTools", label: "Customize", hotkey: "mod+shift+m", isEnabledInContentEditable: true, run: handlers.openTools },
    { id: "sand.focusInput", label: "Focus prompt", hotkey: "mod+i, mod+l", run: handlers.focusPrompt },
    { id: "sand.focusSearch", label: "Search agents", hotkey: "mod+shift+f", isEnabledInContentEditable: true, run: handlers.openSearch },
    { id: "sand.previousAgent", label: "Previous agent", hotkey: "alt+up", isEnabledInContentEditable: true, run: handlers.previousAgent },
    { id: "sand.nextAgent", label: "Next agent", hotkey: "alt+down", isEnabledInContentEditable: true, run: handlers.nextAgent },
    { id: "sand.navigateBack", label: "Back", hotkey: "mod+bracketleft", isEnabledInContentEditable: true, run: handlers.navigateBack },
    { id: "sand.navigateForward", label: "Forward", hotkey: "mod+bracketright", isEnabledInContentEditable: true, run: handlers.navigateForward },
    ...Array.from({ length: 9 }, (_, offset): GlobalShortcutAction => {
      const index = offset + 1;
      return {
        id: `sand.focusAgent${index}` as GlobalShortcutAction["id"],
        label: `Focus sidebar agent ${index}`,
        hotkey: `mod+${index}`,
        isEnabledInContentEditable: true,
        run: () => handlers.focusAgent(index)
      };
    })
  ];
  // @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5504264-5504409
  actions.push({ id: "sand.toggleSidebar", label: "Toggle compact sidebar", hotkey: "mod+b", isEnabledInContentEditable: true, run: handlers.toggleSidebar });
  if (handlers.findInChat != null) {
    actions.splice(5, 0, { id: "sand.findInChat", label: "Find in chat", hotkey: "mod+f", isEnabledInContentEditable: true, run: handlers.findInChat });
  }
  return actions;
}

export interface KeyboardShortcutEvent {
  readonly key: string;
  readonly defaultPrevented: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly target?: EventTarget | null;
  preventDefault(): void;
}

function normalizedKey(key: string): string {
  switch (key.toLowerCase()) {
    case "arrowup": return "up";
    case "arrowdown": return "down";
    case "[": return "bracketleft";
    case "]": return "bracketright";
    case ",": return "comma";
    default: return key.toLowerCase();
  }
}

function editableElement(target: EventTarget | null | undefined): boolean {
  if (target == null || typeof target !== "object") return false;
  const value = target as EventTarget & { tagName?: unknown; disabled?: unknown; type?: unknown; isContentEditable?: unknown; matches?: (selector: string) => boolean };
  if (value.isContentEditable === true) return true;
  if (typeof value.matches === "function") {
    try {
      return value.matches("input:not([type='hidden']):not([disabled]),[contenteditable]:not([contenteditable='false']),textarea:not([disabled])");
    } catch {
      return false;
    }
  }
  const tagName = typeof value.tagName === "string" ? value.tagName.toLowerCase() : "";
  if (tagName === "textarea") return value.disabled !== true;
  if (tagName === "input") return value.disabled !== true && value.type !== "hidden";
  return false;
}

function matchesHotkey(event: KeyboardShortcutEvent, hotkey: string): boolean {
  return hotkey.split(",").some((chord) => matchesChord(event, chord.trim()));
}

function matchesChord(event: KeyboardShortcutEvent, chord: string): boolean {
  const firstChord = chord;
  const parts = firstChord.split("+");
  const key = parts.at(-1);
  if (key == null || normalizedKey(event.key) !== key.toLowerCase()) return false;
  const wantsMod = parts.includes("mod");
  const wantsAlt = parts.includes("alt");
  const wantsShift = parts.includes("shift");
  if (wantsMod !== (event.metaKey || event.ctrlKey)) return false;
  if (wantsAlt !== event.altKey || wantsShift !== event.shiftKey) return false;
  return true;
}

export function resolveGlobalShortcutAction(
  event: KeyboardShortcutEvent,
  actions: readonly GlobalShortcutAction[]
): GlobalShortcutAction | null {
  if (event.defaultPrevented) return null;
  const isEditable = editableElement(event.target);
  return actions.find((action) =>
    (action.isEnabledInContentEditable === true || !isEditable) && matchesHotkey(event, action.hotkey)
  ) ?? null;
}

export interface OverlayEscapeState {
  readonly isArmed: boolean;
  readonly isOverlayStacked: boolean;
  readonly close: () => void;
}

export interface KeyboardShortcutTarget {
  addEventListener(type: "keydown", listener: (event: KeyboardEvent) => void): void;
  removeEventListener(type: "keydown", listener: (event: KeyboardEvent) => void): void;
}

export interface GlobalKeyboardShortcutController {
  readonly subscribe: (target: KeyboardShortcutTarget) => () => void;
  readonly setActions: (actions: readonly GlobalShortcutAction[]) => void;
  readonly acceptOverlayState: (state: OverlayEscapeState) => void;
}

/**
 * Standalone handoff for the production shell. Subscription is reference-counted
 * like the shipped hotkey and Escape controllers; the root owns the actual actions.
 */
export function createGlobalKeyboardShortcutController(
  initialActions: readonly GlobalShortcutAction[],
  initialOverlayState: OverlayEscapeState = { isArmed: false, isOverlayStacked: false, close: () => {} }
): GlobalKeyboardShortcutController {
  let actions = initialActions;
  let overlayState = initialOverlayState;
  let subscribers = 0;
  let target: KeyboardShortcutTarget | null = null;

  const onKeyDown = (rawEvent: KeyboardEvent) => {
    const event = rawEvent as unknown as KeyboardShortcutEvent;
    if (event.key === "Escape") {
      if (overlayState.isArmed && !overlayState.isOverlayStacked && !event.defaultPrevented) overlayState.close();
      return;
    }
    const action = resolveGlobalShortcutAction(event, actions);
    if (action == null) return;
    event.preventDefault();
    void action.run();
  };

  const subscribe = (nextTarget: KeyboardShortcutTarget): (() => void) => {
    if (subscribers === 0) {
      target = nextTarget;
      target.addEventListener("keydown", onKeyDown);
    }
    subscribers += 1;
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      subscribers -= 1;
      if (subscribers === 0 && target != null) {
        target.removeEventListener("keydown", onKeyDown);
        target = null;
      }
    };
  };

  return {
    subscribe,
    setActions: (nextActions) => { actions = nextActions; },
    acceptOverlayState: (nextState) => { overlayState = nextState; }
  };
}
