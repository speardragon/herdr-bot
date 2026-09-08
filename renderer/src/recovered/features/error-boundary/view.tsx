import { useId, useState } from "react";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L499
// Immutable root sha256: ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa

export interface ErrorBoundaryLabels {
  title: string;
  detail: string;
  reload: string;
  copyError: string;
  copied: string;
}

export interface ErrorBoundarySurfaceProps {
  error: Error;
  componentStack?: string | null;
  labels: ErrorBoundaryLabels;
}

function formatError(error: Error, componentStack: string | null | undefined): string {
  const lines = [`${error.name}: ${error.message}`];
  if (error.stack?.trim()) lines.push(`Stack trace:\n${error.stack.trim()}`);
  lines.push(`Component stack:\n${componentStack?.trim() || "(unavailable)"}`);
  return lines.join("\n\n");
}

export function ErrorBoundarySurface({ error, componentStack, labels }: ErrorBoundarySurfaceProps) {
  const titleId = useId();
  const detailId = useId();
  const [copied, setCopied] = useState(false);
  const copyError = async () => {
    const clipboard = typeof navigator === "undefined" ? null : navigator.clipboard;
    if (clipboard == null) return;
    try {
      await clipboard.writeText(formatError(error, componentStack));
      setCopied(true);
    } catch {
      // Keep the error surface visible when clipboard access is unavailable.
    }
  };
  return <div className="sand-error-boundary--app" style={{ display: "grid", height: "100%", placeItems: "center" }}>
    <div>
      <div aria-describedby={detailId} aria-labelledby={titleId} role="alert">
        <p id={titleId}>{labels.title}</p>
        <p id={detailId}>{labels.detail}</p>
      </div>
      <div>
        <button onClick={() => window.location.reload()} type="button">{labels.reload}</button>
        <button onClick={() => void copyError()} type="button">{copied ? labels.copied : labels.copyError}</button>
      </div>
    </div>
  </div>;
}
