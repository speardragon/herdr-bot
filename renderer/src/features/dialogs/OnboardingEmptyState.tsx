import { useDialogHost } from "../../shell/DialogHost.tsx";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { NewDialog } from "./NewDialog.tsx";
import { QuickCreateBot } from "./QuickCreateBot.tsx";

/**
 * The zero-bots main-column content: the entire main-column content, not a modal --
 * same quick-create flow as the sidebar's "+" menu, just with two lines of explainer copy above it.
 * Rendered by `useMainColumnOverride()` whenever no bot exists yet, regardless of `activeChatId`.
 */
export function OnboardingEmptyState() {
  const dialogHost = useDialogHost();
  const { t } = useT();

  return (
    <QuickCreateBot
      showExplainer
      onAdvanced={() => dialogHost.open(<NewDialog initialTab="bot" />, { titleKey: "dialogs.new.title" })}
    />
  );
}
