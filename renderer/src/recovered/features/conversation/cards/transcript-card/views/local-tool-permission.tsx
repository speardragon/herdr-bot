import { LocalToolPermissionPrompt } from "../../../../permissions/local-tool/view";
import { projectLeafEntry, useTranscriptCardLeafProviders, type TranscriptCardLeafProps } from "./shared";

// @evidence src/app/dist/renderer/assets/view-DW7RVxhH.js#byteLength=303 (local-tool-permission card leaf)
// @evidence src/app/dist/renderer/assets/view-DW7RVxhH.js#SHA256=eab3497c94fe6b3ba501fb72ecf13121ea7bd866d97d1051cf63a28f5f8aaf04
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5361209 (exact prompt action/state surface)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5629506 (existing local-tool permission bridge store)

/**
 * The shipped lazy leaf delegates directly to the existing permission prompt.
 * Missing store/RPC ownership remains fail-closed rather than rendering inert actions.
 */
export function LocalToolPermissionTranscriptCard(props: TranscriptCardLeafProps) {
  const entry = projectLeafEntry(props.entry);
  const providers = useTranscriptCardLeafProviders();
  if (entry == null || entry.message.type !== "local-tool-permission" || providers?.localToolPermissionStore == null || providers.resolveLocalToolPermission == null) return null;
  return <LocalToolPermissionPrompt
    agentId={providers.scope.agentId}
    ask={entry.message.ask}
    entryId={entry.id}
    resolveLocalToolPermission={providers.resolveLocalToolPermission}
    store={providers.localToolPermissionStore}
  />;
}

export default LocalToolPermissionTranscriptCard;
