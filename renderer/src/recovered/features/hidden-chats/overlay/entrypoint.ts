import { alwaysAvailable, defineEntrypoint } from "../../../runtime/define-entrypoint";

export type HiddenChatsOverlayParams = Record<string, never>;

export default defineEntrypoint<HiddenChatsOverlayParams>({
  availability: alwaysAvailable,
  loadView: () => import("./view")
});
