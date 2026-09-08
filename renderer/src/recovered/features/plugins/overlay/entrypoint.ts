import { alwaysAvailable, defineEntrypoint } from "../../../runtime/define-entrypoint";

export interface PluginsOverlayParams {
  focusBrowseQuery?: string;
  focusPlugin?: string;
  focusServerId?: string;
  focusWorkflowId?: string;
}

export default defineEntrypoint<PluginsOverlayParams>({
  availability: alwaysAvailable,
  loadView: () => import("./view")
});
