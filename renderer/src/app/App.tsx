import { BridgeProvider } from "../data/BridgeContext.tsx";
import type { HerdrBridge } from "../data/bridge.ts";
import { StoreProvider } from "../data/store/StoreProvider.tsx";
import { DialogsSlot } from "../features/dialogs/DialogsSlot.tsx";
import { PaletteSlot } from "../features/palette/PaletteSlot.tsx";
import { TranslationProvider } from "../i18n/TranslationProvider.tsx";
import { ToastProvider } from "../primitives/index.ts";
import { DialogHost } from "../shell/DialogHost.tsx";
import { ShortcutsProvider } from "../shell/ShortcutsProvider.tsx";
import { AppShell } from "../shell/AppShell.tsx";
import { ThemeSync } from "./ThemeSync.tsx";

/**
 * Provider composition root. Order matters: `BridgeProvider` first (everything else reads
 * `window.herdrBot`/the fake bridge through it), `StoreProvider` next (needs the bridge),
 * `TranslationProvider` needs the bridge's locale, `ShortcutsProvider` needs the bridge's platform,
 * `ToastProvider`/`DialogHost` have no dependencies but must wrap whatever calls `useToast`/
 * `useDialogHost` (effectively everything below them).
 */
export function App({ bridge }: { readonly bridge: HerdrBridge }) {
  return (
    <BridgeProvider bridge={bridge}>
      <ThemeSync />
      <StoreProvider>
        <TranslationProvider>
          <ShortcutsProvider>
            <ToastProvider>
              <DialogHost>
                <AppShell />
                <PaletteSlot />
                <DialogsSlot />
              </DialogHost>
            </ToastProvider>
          </ShortcutsProvider>
        </TranslationProvider>
      </StoreProvider>
    </BridgeProvider>
  );
}
