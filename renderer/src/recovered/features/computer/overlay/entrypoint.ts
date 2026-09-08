import { alwaysAvailable, defineEntrypoint } from "../../../runtime/define-entrypoint";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L523 UTF-8 bytes 5376312 and 5376601

export interface ComputerOverlayParams {
  focusMonitorId?: string;
}

export default defineEntrypoint<ComputerOverlayParams>({
  availability: alwaysAvailable,
  loadView: () => import("./view")
});
