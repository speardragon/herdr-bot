import { useCallback, useEffect, useState } from "react";
import { useBridge } from "../BridgeContext.tsx";
import { DEFAULT_LOCALE, parseLocale } from "../../i18n/locale.ts";
import type { Locale } from "../../i18n/locale.ts";

export interface LocaleHandle {
  readonly locale: Locale;
  setLocale(locale: Locale): void;
}

/** The UI locale, persisted via `window.herdrBot.locale` (a desktop-bridge setting, independent of the
 * app-api -- see docs/app-api.md's Settings section). `bridge.locale.initial` is always `null`
 * (read synchronously before preload can touch disk), so this starts at `DEFAULT_LOCALE` and corrects
 * itself once the async `get()` resolves. */
export function useLocale(): LocaleHandle {
  const bridge = useBridge();
  const [locale, setLocaleState] = useState<Locale>(() => parseLocale(bridge.locale.initial));

  useEffect(() => {
    let cancelled = false;
    void bridge.locale.get().then((value) => {
      if (!cancelled) setLocaleState(parseLocale(value));
    });
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  useEffect(() => bridge.locale.onChanged((value) => setLocaleState(parseLocale(value as string | null))), [bridge]);

  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleState(next);
      void bridge.locale.set(next);
    },
    [bridge],
  );

  return { locale, setLocale };
}

export { DEFAULT_LOCALE };
