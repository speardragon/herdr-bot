import { useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type MutableRefObject, type Ref } from "react";
import {
  createEmojiCatalogStore,
  EMOJI_SEARCH_LIMIT,
  searchEmoji,
  type EmojiCatalog,
  type EmojiCatalogSnapshot,
  type EmojiCatalogStore,
  type EmojiCategory,
  type EmojiEntry,
} from "./emoji-catalog";
import "./emoji-picker-content.css";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5075764 (sand-emoji-cell labels/pressed state)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5079279 (Search emoji and mGe content contract)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5080518 (loading/results/categories/grid content)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5082200 (section intrinsic-height geometry)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=6382162 (Windows content equivalent)

export const EMOJI_PICKER_WIDTH = 294;
export const EMOJI_PICKER_MAX_HEIGHT = 320;
export const EMOJI_GRID_COLUMNS = 8;
const EMOJI_CELL_SIZE = 34;
const EMOJI_SECTION_BASE_HEIGHT = 30;
const EMPTY_SNAPSHOT = { status: "idle" } as const;

const EMPTY_STORE: EmojiCatalogStore = {
  getSnapshot: () => EMPTY_SNAPSHOT,
  subscribe: () => () => {},
  load: () => Promise.reject(new Error("Emoji catalog is not configured.")),
  reset: () => {},
  dispose: () => {},
};

const defaultStore = createEmojiCatalogStore();

export interface EmojiPickerContentProps {
  readonly catalog?: EmojiCatalog;
  readonly store?: EmojiCatalogStore;
  readonly myReactions?: ReadonlySet<string>;
  readonly recents?: readonly EmojiEntry[];
  readonly onSelect: (emoji: string) => void;
  readonly contentRef?: Ref<HTMLDivElement>;
  readonly autoFocus?: boolean;
}

export interface EmojiPickerContentViewProps {
  readonly snapshot: EmojiCatalogSnapshot;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly myReactions: ReadonlySet<string>;
  readonly recents: readonly EmojiEntry[];
  readonly onSelect: (emoji: string) => void;
  readonly contentRef?: Ref<HTMLDivElement>;
  readonly autoFocus: boolean;
}

export function emojiGridDestination(index: number, key: string, count: number, columns = EMOJI_GRID_COLUMNS): number | null {
  if (count <= 0 || index < 0 || index >= count) return null;
  const row = Math.floor(index / columns);
  const column = index % columns;
  switch (key) {
    case "ArrowLeft": return column > 0 ? index - 1 : index;
    case "ArrowRight": return column < columns - 1 && index + 1 < count ? index + 1 : index;
    case "ArrowUp": return row > 0 ? index - columns : index;
    case "ArrowDown": return index + columns < count ? index + columns : index;
    case "Home": return row * columns;
    case "End": return Math.min(row * columns + columns - 1, count - 1);
    default: return null;
  }
}

function statusView(snapshot: EmojiCatalogSnapshot) {
  if (snapshot.status === "error") {
    // The immutable D5e loader catches chunk failure without shipping error copy.
    // Keep the content fail-closed and expose an assistive live state without inventing text.
    return <div aria-live="polite" data-state="error" role="alert" />;
  }
  return <div aria-live="polite">Loading emoji…</div>;
}

function EmojiCell({
  entry,
  isReacted,
  onSelect,
  entries,
  index,
  cellRefs,
}: {
  readonly entry: EmojiEntry;
  readonly isReacted: boolean;
  readonly onSelect: (emoji: string) => void;
  readonly entries: readonly EmojiEntry[];
  readonly index: number;
  readonly cellRefs: MutableRefObject<Map<number, HTMLButtonElement>>;
}) {
  const setCellRef = (element: HTMLButtonElement | null) => {
    if (element == null) cellRefs.current.delete(index);
    else cellRefs.current.set(index, element);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const next = emojiGridDestination(index, event.key, entries.length);
    if (next == null || next === index) return;
    event.preventDefault();
    cellRefs.current.get(next)?.focus();
  };
  const label = isReacted ? `Remove ${entry.name} reaction` : `React with ${entry.name}`;
  return (
    <button
      aria-label={label}
      aria-pressed={isReacted}
      className="sand-emoji-cell"
      onClick={() => onSelect(entry.native)}
      onKeyDown={onKeyDown}
      ref={setCellRef}
      title={entry.name}
      type="button"
    >
      {entry.native}
    </button>
  );
}

function EmojiGrid({
  entries,
  myReactions,
  onSelect,
}: {
  readonly entries: readonly EmojiEntry[];
  readonly myReactions: ReadonlySet<string>;
  readonly onSelect: (emoji: string) => void;
}) {
  const cellRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  return (
    <div className="sand-emoji-picker__grid">
      {entries.map((entry, index) => (
        <EmojiCell
          entries={entries}
          index={index}
          isReacted={myReactions.has(entry.native)}
          entry={entry}
          key={entry.id}
          onSelect={onSelect}
          cellRefs={cellRefs}
        />
      ))}
    </div>
  );
}

function EmojiSection({ category, myReactions, onSelect }: { readonly category: EmojiCategory; readonly myReactions: ReadonlySet<string>; readonly onSelect: (emoji: string) => void }) {
  const sectionStyle = { containIntrinsicHeight: `${EMOJI_SECTION_BASE_HEIGHT + Math.ceil(category.emojis.length / EMOJI_GRID_COLUMNS) * EMOJI_CELL_SIZE}px` } as CSSProperties;
  return (
    <section aria-label={category.label} className="sand-emoji-picker__section" style={sectionStyle}>
      <span>{category.label}</span>
      <EmojiGrid entries={category.emojis} myReactions={myReactions} onSelect={onSelect} />
    </section>
  );
}

export function EmojiPickerContentView({
  snapshot,
  query,
  onQueryChange,
  myReactions,
  recents,
  onSelect,
  contentRef,
  autoFocus,
}: EmojiPickerContentViewProps) {
  const input = (
    <input
      aria-label="Search emoji"
      autoFocus={autoFocus}
      onChange={(event) => onQueryChange(event.currentTarget.value)}
      placeholder="Search emoji"
      type="search"
      value={query}
    />
  );
  const contentStyle = { width: `${EMOJI_PICKER_WIDTH}px`, maxHeight: `${EMOJI_PICKER_MAX_HEIGHT}px`, overflowY: "auto" } as CSSProperties;
  if (snapshot.status !== "ready") {
    return <div aria-label="Choose an emoji" ref={contentRef} style={contentStyle}>{input}{statusView(snapshot)}</div>;
  }

  if (query.trim().length > 0) {
    const results = searchEmoji(snapshot.catalog, query, EMOJI_SEARCH_LIMIT, recents);
    if (results.length === 0) {
      return <div aria-label="Choose an emoji" ref={contentRef} style={contentStyle}>{input}<div>No emoji found</div></div>;
    }
    return (
      <div aria-label="Choose an emoji" ref={contentRef} style={contentStyle}>
        {input}
        <div className="sand-emoji-picker__results">
          <span>Results</span>
          <EmojiGrid entries={results} myReactions={myReactions} onSelect={onSelect} />
        </div>
      </div>
    );
  }

  return (
    <div aria-label="Choose an emoji" ref={contentRef} style={contentStyle}>
      {input}
      <div className="sand-emoji-picker__results">
        {snapshot.catalog.categories.map((category) => <EmojiSection category={category} key={category.id} myReactions={myReactions} onSelect={onSelect} />)}
      </div>
    </div>
  );
}

export function EmojiPickerContent({
  catalog,
  store,
  myReactions = new Set<string>(),
  recents = [],
  onSelect,
  contentRef,
  autoFocus = true,
}: EmojiPickerContentProps) {
  const activeStore = catalog == null ? store ?? defaultStore : EMPTY_STORE;
  const snapshot = useSyncExternalStore(activeStore.subscribe, activeStore.getSnapshot, activeStore.getSnapshot);
  const [query, setQuery] = useState("");
  return (
    <EmojiPickerContentView
      autoFocus={autoFocus}
      contentRef={contentRef}
      myReactions={myReactions}
      onQueryChange={setQuery}
      onSelect={onSelect}
      query={query}
      recents={recents}
      snapshot={catalog == null ? snapshot : { status: "ready", catalog }}
    />
  );
}
