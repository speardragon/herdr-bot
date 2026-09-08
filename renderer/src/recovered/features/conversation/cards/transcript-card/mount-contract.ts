import type { CloudAgentProvider } from "./cloud-agent-provider";
import type { TranscriptCardEntry, TranscriptCardScope } from "./protocol";
import { projectTranscriptCardEntries } from "./protocol";
import type { TranscriptCardRegistry } from "./registry";
import type { WidgetInteractionAdapter } from "./widget-interactions";
import type { TranscriptCardLeafProviders } from "./views/shared";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5111152 (cloudAgents/handoffs card context shape)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5214895 (immutable transcript interactions provider mount)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5119820 (lazy card body dispatcher contract)

export interface TranscriptCardRootMountContract {
  readonly scope: TranscriptCardScope;
  readonly registry: TranscriptCardRegistry;
  readonly widgetInteractions: WidgetInteractionAdapter;
  readonly cloudAgents: CloudAgentProvider;
  readonly leafProviders: TranscriptCardLeafProviders;
  readonly projectEntries: (values: readonly unknown[]) => TranscriptCardEntry[];
}

export function createTranscriptCardRootMountContract(options: Omit<TranscriptCardRootMountContract, "projectEntries" | "leafProviders"> & { leafProviders?: Partial<TranscriptCardLeafProviders> }): TranscriptCardRootMountContract {
  return {
    ...options,
    leafProviders: {
      ...options.leafProviders,
      scope: options.scope,
      widgetInteractions: options.widgetInteractions,
      cloudAgents: options.cloudAgents,
    },
    projectEntries(values) {
      return projectTranscriptCardEntries(values).entries;
    },
  };
}
