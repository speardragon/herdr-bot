# features/composer

Owns: the rich-text compose box (Tiptap), @-mention autocomplete, attachments, Enter/Shift+Enter
handling, IME safety, draft persistence, and the reply-target preview bar.

## Architecture

- `ComposerSlot.tsx` -- the component. Builds one `useEditor` instance (deps `[]`, so it's never
  recreated) with a minimal schema: `Document`, `Paragraph`, `Text`, `HardBreak`, `UndoRedo`, `Placeholder`,
  the custom `ComposerMention` node, and `ComposerSendKeymap`. Deliberately **not** `@tiptap/starter-kit`
  -- no bold/italic/headings/lists, because what the user sees must equal the plain `text` the host
  actually routes on (see "Mention routing" below); formatting marks would have no representation there.
- `composer-keymap.ts` -- Enter-to-send via `addKeyboardShortcuts` (not `editorProps.handleKeyDown`) so
  plugin priority does the right thing automatically: `@tiptap/extension-mention` registers its
  suggestion plugin at priority 101 (above this extension's default 100), so while the mention popover is
  open it sees Enter/ArrowUp/ArrowDown first; once it's closed (including right after Escape, which the
  suggestion plugin auto-exits on its own), Enter falls through here. IME safety is `this.editor.view.
  composing` checked first -- confirmed in the real Electron app via CDP's `Input.imeSetComposition` that
  a bare Enter dispatched mid-composition does **not** send (see "Testing" below for what that did and
  didn't prove).
- `mention-extension.tsx` -- extends the stock Mention node with an `everyone` attr and a React node view
  (`ReactNodeViewRenderer`) so the inserted chip always reads the bot's *current* name/avatar via
  `useChat(id)`, not whatever was true at insertion time.
- `mention-suggestion.ts` -- wires `@tiptap/suggestion`'s imperative render lifecycle to a `MentionList`
  mounted via Tiptap's `ReactRenderer` (which renders through `editor.contentComponent`'s own portal set,
  so it still has full app context -- same mechanism node views use). `allow` returns false whenever the
  chat has no members (a bot DM), so `@` just stays a literal character there instead of opening an
  empty popover -- see `mention-candidates.ts`'s doc comment for why.
- `rich-text.ts` -- pure (DOM/editor-free) serialization of the Tiptap doc into what `message.send`
  needs. See "Mention routing" and "richText wire format" below -- this is the one module most worth
  reading before touching anything else in this folder.
- `draft-codec.ts` -- (de)serializes `{doc, attachments}` to/from the single opaque string
  `data/drafts.ts`'s `DraftStore` already persists per chat id. Falls back to treating anything that
  isn't valid `ComposerDraftState` JSON as an earlier plain-text draft format, so an existing
  unsent draft isn't destroyed by this format change.
- `../../data/reply-target.ts` -- see "Reply target contract" below (shared with `features/conversation`,
  not a file in this folder).
- `attachment-validation.ts` -- pure pre-check (25MB cap, empty-file) plus the i18n-key mapping for
  `window.herdrBot.attachments.stage()`'s own `{ok:false, reason}` result.

## Mention routing -- read this before changing `rich-text.ts`

**The host does not parse `richText` for bot routing at all.** It's purely a UI-rendering convenience;
the host only ever reads the plain `text`/`content` string. A room's "who should answer" logic
(`core/src/group/group-chat.ts`'s `parseGroupMentions`/`memberMentionHandles`, confirmed by reading
`core/` directly) scans that plain string for a **literal, word-boundary-
respecting `@handle`**, where a valid handle is the member's lowercased full name, its whitespace-
squashed name, its first word, or its id; `@everyone`/`@all` addresses the whole room. So
`buildMessagePayload`'s plain-text output for a mention run is `@` + the bot's current name with
whitespace stripped (`squashHandle`) -- guaranteed to be in that handle set regardless of whether the
name itself has a space in it. **If you change how a mention serializes to plain text, re-verify against
`memberMentionHandles` or messages will silently stop routing to the mentioned bot.** This was confirmed
end-to-end in the real Electron app (not just unit-tested): sending "@Forge ..." in a room produced a
transcript entry whose `content` contains the literal token `@Forge`.

A mention also re-resolves the bot's **current** name at send time (`resolveMentionName`, looked up from
the live chat list, not the label stored on the node at insertion time) -- both so a late rename doesn't
silently stop the message from routing, and so the richText chip `features/conversation` renders matches
what actually routed it.

## richText wire format

`richText` is a JSON string shaped like a minimal Tiptap/ProseMirror `JSONContent` document, restricted to
this folder's own schema:

```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "hey " },
        { "type": "mention", "attrs": { "id": "bot-forge", "label": "Forge", "everyone": false } },
        { "type": "text", "text": " can you look" },
        { "type": "hardBreak" },
        { "type": "text", "text": "next line" }
      ]
    }
  ]
}
```

Three inline node `type`s only: `"text"` (`text` field), `"hardBreak"` (a line break within a paragraph),
`"mention"` (`attrs.id`, `attrs.label` -- the bot's name *as resolved at send time*, not whatever label
was stored when the mention was typed -- and `attrs.everyone`). `richText` is **omitted** (not an empty
string) whenever the message has no mention at all, so a plain message stays lean.

**For `features/conversation` (owns rendering a sent message's mention chips):** parse this JSON and walk
`content[].content[]`; render a `text` node verbatim, a `hardBreak` as a line break, and a `mention` node
as the same chip this composer renders (mascot avatar + bold name, no background, one line tall) -- look the bot up live by `attrs.id` for its current avatar, falling back to
`attrs.label` if it's been deleted since. If richText is absent or fails to parse, fall back to the plain
`content`/`text` field (it's still fully readable prose, just without a live chip). Since this schema is
a strict subset of real Tiptap JSONContent, `@tiptap/html`'s `generateHTML()` with this same minimal
extension set (`Document`, `Paragraph`, `Text`, `HardBreak`, a Mention-shaped node) would also render it
directly, if that's a more convenient integration point than a bespoke walker.

## Reply target contract (shared with `features/conversation`)

There's no top-level `AppState.replyTarget` (deliberately not added to the shared `data/store/`
code) -- `data/reply-target.ts` is a tiny standalone module-level store, keyed by
`chatId`, shared between this folder and `features/conversation`:

```ts
import { setReplyTarget, clearReplyTarget } from "../../data/reply-target.ts";

// From the message hover "Reply" action (features/conversation/HoverActions.tsx):
setReplyTarget(chatId, { entryId, authorName, preview });
```

`preview` should be a short plain-text snippet of the message being replied to -- the composer only
renders whatever's passed in, it never re-fetches the transcript. The composer calls
`clearReplyTarget(chatId)` itself (via `useReplyTarget(chatId)`'s returned `.clear()`) once the reply
sends or the bar's own "×" is clicked; `features/conversation` never needs to clear it. In-memory only
(not persisted across an app restart), unlike the draft it rides alongside.

## Judgment calls / things worth re-confirming

- **Mention autocomplete is room-only.** A bot 1:1 DM has `memberIds: []` (nothing to mention, and
  "Everyone" makes no sense with a single other participant), so `@` just stays a literal character
  there -- confirmed in the running app. This is a deliberate extrapolation for the DM case, not
  documented elsewhere.
- **Placeholder particle varies by chat kind.** The Korean placeholder uses 에게 (dative) for a bot vs.
  에 (locative) for a room (`placeholder.ts`) -- purely a function of chat *kind*, no 받침/batchim
  detection involved. English uses the same template either way.
- **No image thumbnail preview** for a staged attachment, even a valid image -- possibly just unwired
  rather than an intentional omission, but this build keeps it as the generic filename/size chip either
  way.
- **Disabled state**: the composer disables itself only while its own `message.send` call is in flight
  (prevents a double-submit); "disabled while the bot is mid-turn" isn't implemented -- a bot can still
  receive a new message while working, which the host handles as an interrupt (see
  `core/src/services/turn-service.ts`).
- **A staged attachment path saved in a draft can go stale.** `desktop/src/staged-attachment-sweep.ts`
  deletes anything under `<userData>/staged/` that's both older than `DEFAULT_SWEEP_MAX_AGE_MS` (7 days)
  **and** unreferenced by any transcript -- a path sitting only in an unsent draft's `localStorage` blob
  is exactly that. After a week of never sending that draft, the chip still renders (the draft only
  stores `{path, filename, size}`, not the bytes), but `attachments.commit()` at send time will fail for
  it; this surfaces as the existing `composer.attachment.error.failed` toast, not a crash. Not fixed here
  (would mean either re-staging on send or the sweep learning about drafts) -- flagging so it isn't
  mistaken for a bug during testing with an old draft.

## Tests

`renderer/test/composer-*.test.ts`: `rich-text` (doc→payload serialization, the mention-routing plain-
text requirement, richText presence/shape), `mention-candidates` (Everyone-first ordering, filtering),
`placeholder` (the kind→particle rule), `draft-codec` (round-trip, legacy plain-text fallback, corrupt-
JSON fallback), `attachment-validation` (size cap, i18n key mapping). All pure/DOM-free.
