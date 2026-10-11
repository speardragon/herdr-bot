import { useState } from "react";
import type { ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { useBridge } from "../../data/BridgeContext.tsx";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { IconButton } from "../../primitives/index.ts";
import { expandMentionsInBlocks, isSafeLinkHref, parseMarkdown } from "./markdown.ts";
import type { BlockNode, InlineNode } from "./markdown.ts";
import type { MentionCandidate } from "./mentions.ts";
import { MentionChip } from "./MentionChip.tsx";
import { parseRichTextBlocks } from "./rich-text.ts";
import styles from "./MarkdownView.module.css";

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

export interface MarkdownViewProps {
  readonly text: string;
  /** The composer's Tiptap `richText` JSON, when the entry has one (user messages only -- see
   * entry-shapes.ts#getRichText). When present and parseable it is rendered *instead of* markdown-parsing
   * `text` (the composer doesn't accept markdown input, so there's nothing markdown-specific to lose);
   * otherwise this falls back to `text` exactly as before. */
  readonly richText?: string | null;
  /** The chat's current members (room) or just the bot (DM) -- used to resolve `@Name` text into mention
   * chips (mentions.ts), and to look up a richText mention's *current* name/avatar by id. */
  readonly members: readonly MentionCandidate[];
}

/** Renders a message body as safe React elements -- never `dangerouslySetInnerHTML` (see markdown.ts's
 * module doc). Supports this subset: paragraphs, bold/italic, inline code, fenced
 * code blocks (with a "Copy code" button), ordered/unordered lists, links (external-only, `http(s)`/
 * `mailto` scheme-checked), blockquotes, and `@mention` chips -- from either plain markdown text or the
 * composer's rich-text JSON (rich-text.ts). */
export function MarkdownView({ text, richText, members }: MarkdownViewProps) {
  const richBlocks = richText != null ? parseRichTextBlocks(richText) : null;
  const blocks = expandMentionsInBlocks(richBlocks ?? parseMarkdown(text), members);
  return (
    <div className={styles["hb-markdown"]}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
}

function Block({ block }: { readonly block: BlockNode }) {
  if (block.type === "paragraph") {
    return (
      <p className={styles["hb-markdown-paragraph"]}>
        <Inline nodes={block.children} />
      </p>
    );
  }
  if (block.type === "heading") {
    const HeadingTag = HEADING_TAGS[Math.min(6, Math.max(1, block.level)) - 1]!;
    return (
      <HeadingTag className={styles["hb-markdown-heading"]}>
        <Inline nodes={block.children} />
      </HeadingTag>
    );
  }
  if (block.type === "codeBlock") return <CodeBlock lang={block.lang} code={block.code} />;
  if (block.type === "list") {
    const ListTag = block.ordered ? "ol" : "ul";
    return (
      <ListTag className={styles["hb-markdown-list"]}>
        {block.items.map((item, index) => (
          <li key={index}>
            <Inline nodes={item} />
          </li>
        ))}
      </ListTag>
    );
  }
  // blockquote
  return (
    <blockquote className={styles["hb-markdown-blockquote"]}>
      {block.children.map((child, index) => (
        <Block key={index} block={child} />
      ))}
    </blockquote>
  );
}

function Inline({ nodes }: { readonly nodes: readonly InlineNode[] }) {
  return (
    <>
      {nodes.map((node, index) => (
        <InlineSpan key={index} node={node} />
      ))}
    </>
  );
}

function InlineSpan({ node }: { readonly node: InlineNode }): ReactNode {
  if (node.type === "text") return node.value;
  if (node.type === "break") return <br />;
  if (node.type === "bold") return (
    <strong>
      <Inline nodes={node.children} />
    </strong>
  );
  if (node.type === "italic") return (
    <em>
      <Inline nodes={node.children} />
    </em>
  );
  if (node.type === "code") return <code className={styles["hb-markdown-inline-code"]}>{node.value}</code>;
  if (node.type === "mention") return <MentionChip id={node.id} name={node.name} />;
  // link
  return <ExternalLink href={node.href} nodes={node.children} />;
}

function ExternalLink({ href, nodes }: { readonly href: string; readonly nodes: readonly InlineNode[] }) {
  const bridge = useBridge();
  if (!isSafeLinkHref(href)) return <Inline nodes={nodes} />;
  return (
    <a
      href={href}
      className={styles["hb-markdown-link"]}
      onClick={(event) => {
        event.preventDefault();
        void bridge.openExternal(href);
      }}
    >
      <Inline nodes={nodes} />
    </a>
  );
}

function CodeBlock({ lang, code }: { readonly lang: string | null; readonly code: string }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied (e.g. no secure context in a dev harness) -- failing silently is
      // preferable to throwing out of a click handler for a non-critical convenience action.
    }
  }

  return (
    <div className={styles["hb-markdown-codeblock"]}>
      <div className={styles["hb-markdown-codeblock-copy"]}>
        <IconButton size="sm" aria-label={t("conversation.copyCode")} onClick={() => void copy()}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </IconButton>
      </div>
      <pre className={styles["hb-markdown-codeblock-pre"]}>
        <code data-lang={lang ?? undefined}>{code}</code>
      </pre>
    </div>
  );
}
