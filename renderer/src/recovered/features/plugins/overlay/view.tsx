import type { ComponentType } from "react";
import type { PluginsOverlayParams } from "./entrypoint";
import { PluginsBrowser, type PluginsBrowserProps } from "./browser";

export interface PluginsDialogProps extends PluginsOverlayParams {
  agentId?: string;
  isOpen: boolean;
  presentation?: unknown;
  onClose(): void;
}

export type PluginsOverlayContext = Omit<PluginsDialogProps, keyof PluginsOverlayParams | "isOpen">;

export function normalizePluginsOverlayParams(params: PluginsOverlayParams): Required<PluginsOverlayParams> {
  return {
    focusBrowseQuery: params.focusBrowseQuery ?? "",
    focusPlugin: params.focusPlugin ?? "",
    focusServerId: params.focusServerId ?? "",
    focusWorkflowId: params.focusWorkflowId ?? ""
  };
}

export function createPluginsOverlayView(
  useOverlayContext: () => PluginsOverlayContext,
  PluginsDialog: ComponentType<PluginsDialogProps>
) {
  return function PluginsOverlayView({ params }: { params: PluginsOverlayParams }) {
    const context = useOverlayContext();
    return <PluginsDialog {...context} {...params} isOpen />;
  };
}

export interface PluginsDialogShellProps extends PluginsBrowserProps {
  isOpen: boolean;
  onClose(): void;
}

export function PluginsDialogShell({ isOpen, onClose, ...browserProps }: PluginsDialogShellProps) {
  if (!isOpen) return null;
  return (
    <div aria-label="Plugins" aria-modal="true" className="sand-plugins-dialog" role="dialog">
      <button aria-label="Close" className="sand-plugins-dialog__close" onClick={onClose} type="button">×</button>
      <PluginsBrowser {...browserProps} />
    </div>
  );
}

export default function PluginsOverlaySourceBoundary(_props: { params: PluginsOverlayParams }) {
  return null;
}
