import type { PluginAuthBlock } from "./github-auth";
import { pluginAuthBlockedDetail } from "./github-auth";

export interface PluginGitHubAuthBannerProps {
  readonly authBlocked: readonly PluginAuthBlock[];
  readonly isLaunching: boolean;
  onFix(): void;
}

// @evidence src/app/dist/renderer/assets/view-B5Ug8wEm.js#byteOffset=42007 (Mac exact banner)
// @evidence recovered/frontend/app/assets/view-B5Ug8wEm.js#byteOffset=52353 (Windows exact banner)
export function PluginGitHubAuthBanner({ authBlocked, isLaunching, onFix }: PluginGitHubAuthBannerProps) {
  if (authBlocked.length === 0) return null;
  return (
    <section
      aria-label="Plugin content needs GitHub authentication"
      className="sand-9f619 sand-78zum5 sand-6s0dn4 sand-ou54vl sand-2lah0s sand-889kno sand-cicffo sand-1a8lsjc sand-f18ygs sand-1q4ynmn sand-1xv9fit sand-1o5m0de"
      role="status"
    >
      <span className="sand-78zum5 sand-dt5ytf sand-195vfkc sand-1iyjqo2 sand-s83m0k sand-euugli">
        <span className="sand-vak8d5">Complete GitHub auth to sync installed plugins</span>
        <span className="sand-19aaqeu">{pluginAuthBlockedDetail(authBlocked)}</span>
      </span>
      <button disabled={isLaunching} onClick={onFix} type="button">
        {isLaunching ? "Opening…" : "Fix with agent"}
      </button>
    </section>
  );
}
