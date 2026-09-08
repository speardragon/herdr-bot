import { alwaysAvailable, defineEntrypoint } from "../../../runtime/define-entrypoint";

export interface SettingsOverlayParams {
  section?: string;
}

export default defineEntrypoint<SettingsOverlayParams>({
  availability: alwaysAvailable,
  loadView: () => import("./view")
});
