interface UpstreamManifest {
  entry: string;
  styles: string[];
}

declare global {
  interface Window {
    __grokUpstreamBoot?: Promise<unknown>;
  }
}

async function loadStylesheet(href: string): Promise<void> {
  if (document.querySelector(`link[data-recovered-upstream][href="${href}"]`)) return;
  await new Promise<void>((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.recoveredUpstream = "true";
    link.addEventListener("load", () => resolve(), { once: true });
    link.addEventListener("error", () => reject(new Error(`Unable to load recovered stylesheet: ${href}`)), { once: true });
    document.head.append(link);
  });
}

async function loadRecoveredRenderer(): Promise<unknown> {
  const response = await fetch("/__reconstructed_manifest");
  if (!response.ok) throw new Error(`Unable to resolve recovered renderer assets: ${response.status}`);
  const manifest = await response.json() as UpstreamManifest;
  await Promise.all(manifest.styles.map(loadStylesheet));
  return await import(/* @vite-ignore */ manifest.entry);
}

export function bootRecoveredRenderer(): Promise<unknown> {
  window.__grokUpstreamBoot ??= loadRecoveredRenderer();
  return window.__grokUpstreamBoot;
}
