/**
 * Enter-to-send, wired as a Tiptap `Extension` (rather than a raw `editorProps.handleKeyDown`) so plugin
 * priority does the right thing automatically instead of this code having to track "is the mention
 * popover open" itself:
 *
 * - `@tiptap/extension-mention` registers itself at `priority: 101` (above the default 100), and
 *   ProseMirror resolves `handleKeyDown` by priority/plugin order, highest first. While the `@`-mention
 *   suggestion popover is open, its own `handleKeyDown` sees Enter/ArrowUp/ArrowDown first and either
 *   handles them (returns `true`, so this extension's binding never runs) or declines (returns `false`,
 *   falling through here) -- see `@tiptap/suggestion`'s plugin, which never special-cases Enter once the
 *   popover isn't active. So by construction: popover open + highlighted row -> Enter picks it; popover
 *   closed (including right after Escape, which the suggestion plugin exits on its own) -> Enter reaches
 *   this binding and sends. No manual "is it open" bookkeeping needed here at all.
 * - Shift+Enter is never seen here: `@tiptap/extension-hard-break` binds `Shift-Enter`/`Mod-Enter` to
 *   insert a line break, and ProseMirror only tries one matching binding per key combo, so a distinct
 *   chord like Shift+Enter never reaches this extension's bare `Enter` binding in the first place.
 * - IME safety: `this.editor.view.composing` is ProseMirror's own authoritative "a composition session
 *   is active" flag (true between `compositionstart`/`compositionend`). Checked explicitly and first --
 *   ProseMirror's base keymap handling is believed to already decline key bindings mid-composition, but
 *   the task calls for this to be *proven* safe rather than assumed, so it's asserted here rather than
 *   left implicit.
 */
import { Extension } from "@tiptap/core";

export interface ComposerSendKeymapOptions {
  onSend: () => void;
}

export const ComposerSendKeymap = Extension.create<ComposerSendKeymapOptions>({
  name: "composerSendKeymap",

  addOptions() {
    return { onSend: () => {} };
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        if (this.editor.view.composing) return false;
        this.options.onSend();
        return true;
      },
    };
  },
});
