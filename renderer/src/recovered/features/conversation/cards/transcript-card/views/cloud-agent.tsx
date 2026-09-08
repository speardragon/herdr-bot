import { useEffect, useId, useState } from "react";
import type { CloudAgentInfo, CloudAgentStatus } from "../cloud-agent-provider";
import { projectLeafEntry, useTranscriptCardLeafProviders, type TranscriptCardLeafProps } from "./shared";

// @evidence src/app/dist/renderer/assets/view-CizPQWLy.js#byteOffset=0 (cloud-agent card leaf)
// @evidence src/app/dist/renderer/assets/view-CizPQWLy.js#byteOffset=1912 (cloud-agent provider/context/open lifecycle)
// @evidence src/app/dist/renderer/assets/view-CizPQWLy.js#byteOffset=5912 (status, PR, branch, stats, and actions)

const statusLabels: Record<CloudAgentStatus, { label: string; tone: string }> = {
  creating: { label: "Creating", tone: "accent" },
  running: { label: "Running", tone: "accent" },
  finished: { label: "Done", tone: "done" },
  error: { label: "Error", tone: "danger" },
  expired: { label: "Expired", tone: "danger" },
  unknown: { label: "Status unavailable", tone: "muted" },
};

function filesChangedLabel(count: number): string {
  return `${count} file${count === 1 ? "" : "s"} changed`;
}

function pullRequestIcon(prState: string | undefined): { name: string; color: string } {
  switch (prState) {
    case "draft": return { name: "git-pull-request-draft", color: "secondary" };
    case "open": return { name: "git-pull-request", color: "git-added" };
    case "merged": return { name: "git-pull-request-done", color: "purple" };
    case "closed": return { name: "git-pull-request-closed", color: "git-removed" };
    case "none": return { name: "git-branch", color: "secondary" };
    default: return { name: "git-pull-request", color: "secondary" };
  }
}

function CloudAgentStatusBadge({ status }: { status: CloudAgentStatus }) {
  const projection = statusLabels[status];
  return <span className={`sand-cursor-agent-card__status sand-cursor-agent-card__status--${projection.tone}`} data-tone={projection.tone} role="status"><span aria-hidden="true" className={projection.tone === "accent" ? "sand-cursor-agent-card__status-spinner" : "sand-cursor-agent-card__status-dot"} />{projection.label}</span>;
}

function CloudAgentBody({ info, onOpen, onOpenPr, disabled }: { info: CloudAgentInfo | null; onOpen: () => void; onOpenPr?: (url: string) => void; disabled: boolean }) {
  const titleId = useId();
  if (info == null) {
    return <article aria-label="Cursor cloud agent" className="sand-cursor-agent-card" aria-busy="true"><div className="sand-cursor-agent-card__content sand-78zum5 sand-dt5ytf sand-1jnr06f sand-h8yej3 sand-euugli"><span aria-hidden="true" className="sand-cursor-agent-card__content" /><span aria-hidden="true" className="sand-cursor-agent-card__content" /><span aria-hidden="true" className="sand-cursor-agent-card__content" /></div></article>;
  }
  const title = info.name?.trim() || "Cursor cloud agent";
  const hasPr = info.prUrl != null && info.prUrl.length > 0;
  return <article aria-labelledby={titleId} className="sand-cursor-agent-card">
    <div className="sand-cursor-agent-card__content sand-78zum5 sand-dt5ytf sand-1jnr06f sand-h8yej3 sand-euugli">
      <div className="sand-cursor-agent-card__header sand-78zum5 sand-6s0dn4 sand-167g77z sand-h8yej3 sand-euugli">
        <div className="sand-cursor-agent-card__title-slot sand-78zum5 sand-1iyjqo2 sand-s83m0k sand-euugli">
          {hasPr && onOpenPr != null ? <button className="sand-cursor-agent-card__title-button" disabled={disabled} onClick={() => onOpenPr(info.prUrl as string)} title="Open the pull request" type="button"><span className="sand-cursor-agent-card__title" id={titleId}>{title}</span></button> : <span className="sand-cursor-agent-card__title" id={titleId}>{title}</span>}
        </div>
        <CloudAgentStatusBadge status={info.status} />
      </div>
      {info.prompt?.trim().length ? <p className="sand-cursor-agent-card__prompt">{info.prompt}</p> : null}
      {info.branchName?.trim().length ? (() => { const icon = pullRequestIcon(info.prState ?? (hasPr ? "unknown" : "none")); return <span className="sand-cursor-agent-card__branch"><span aria-hidden="true" data-color={icon.color} data-icon-name={icon.name} data-size="sm" /> <span className="sand-cursor-agent-card__branch-name">{info.branchName}</span>{info.prNumber == null ? null : <span className="sand-cursor-agent-card__pr-number">PR #{info.prNumber}</span>}</span>; })() : info.prNumber == null ? null : <span className="sand-cursor-agent-card__pr-number">PR #{info.prNumber}</span>}
      {(info.filesChanged ?? 0) > 0 ? <div className="sand-cursor-agent-card__stats"><span className="sand-cursor-agent-card__stats-files"><span aria-hidden="true" data-icon-name="plus-minus" />{filesChangedLabel(info.filesChanged ?? 0)}</span><span className="sand-cursor-agent-card__stat-numbers">{(info.linesAdded ?? 0) > 0 ? <span className="sand-1w5rjie">+{info.linesAdded}</span> : null}{(info.linesRemoved ?? 0) > 0 ? <span className="sand-1jh5svw">-{info.linesRemoved}</span> : null}</span></div> : null}
      <div className="sand-cursor-agent-card__footer"><>{hasPr && onOpenPr != null ? <button className="sand-cursor-agent-card__view-pr" disabled={disabled} onClick={() => onOpenPr(info.prUrl as string)} title="Open the pull request" type="button">View PR <span aria-hidden="true" data-icon-name="arrow-right-up" /></button> : null}</><button className="sand-cursor-agent-card__open" disabled={disabled} onClick={onOpen} title="Open this cloud agent in Cursor" type="button"><span aria-hidden="true" data-icon-name="cursor-logo" />Open in Cursor</button></div>
    </div>
  </article>;
}

export function CloudAgentTranscriptCard(props: TranscriptCardLeafProps) {
  const entry = projectLeafEntry(props.entry);
  const providers = useTranscriptCardLeafProviders();
  const provider = providers?.cloudAgents ?? null;
  const [version, setVersion] = useState(0);
  const bcId = entry?.message.type === "cursor-agent" ? entry.message.bcId : "";
  useEffect(() => {
    if (provider == null || bcId.length === 0) return;
    const watcher = provider.watchInfo(bcId);
    const unsubscribe = watcher.subscribe(() => setVersion((current) => current + 1));
    return () => { unsubscribe(); watcher.release(); };
  }, [bcId, provider]);
  void version;
  if (entry?.message.type !== "cursor-agent") return null;
  const snapshot = provider?.getSnapshot(bcId);
  const info = snapshot?.status === "ready" ? snapshot.value : snapshot?.previous ?? null;
  const isPending = snapshot?.status === "loading" || snapshot?.status === "empty" && info == null;
  const disabled = props.isStale === true || provider == null;
  return <CloudAgentBody info={isPending ? null : info} disabled={disabled} onOpen={() => { if (!disabled) void provider?.open(bcId); }} onOpenPr={providers?.onOpenPullRequest} />;
}

export default CloudAgentTranscriptCard;
