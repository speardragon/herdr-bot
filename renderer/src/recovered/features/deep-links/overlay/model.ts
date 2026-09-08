// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L523
// Immutable root sha256: ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa

export type DeepLinkSource = "protocol" | "https";

export interface DeepLinkInfo {
  version: 1;
  source: DeepLinkSource;
  route: "info";
  topic: "deep-links";
}

export function deepLinkRoute(link: DeepLinkInfo): string {
  return `sand://app/v1/info?topic=${link.topic}`;
}

export function deepLinkSourceLabel(source: DeepLinkSource): string {
  return source === "protocol" ? "Custom protocol (sand://)" : "HTTPS link";
}
