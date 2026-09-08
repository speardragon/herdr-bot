// herdr-bot serves stand-in copies of the upstream hashed assets from renderer/public/assets,
// which Vite exposes at ./assets/<file> in both dev and production builds.
export function rendererRuntimeAssetUrl(file: string): string {
  const base = import.meta.env?.DEV === true
    ? new URL("/assets/", window.location.href)
    : new URL("./", import.meta.url);
  return new URL(file, base).href;
}
