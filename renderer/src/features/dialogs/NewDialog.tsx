import { useState } from "react";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { SegmentedControl } from "../../primitives/index.ts";
import { NewBotForm } from "./NewBotForm.tsx";
import { NewRoomForm } from "./NewRoomForm.tsx";
import styles from "./NewDialog.module.css";

export type NewDialogTab = "bot" | "room";

export interface NewDialogProps {
  readonly initialTab?: NewDialogTab;
}

/** The Advanced New dialog's Bot/Room segmented tabs -- opened via `useDialogs().
 * openNewBotDialog()`/`openNewRoomDialog()`, title ("New") supplied by the `DialogHost.open(...)` call
 * site, not rendered here. */
export function NewDialog({ initialTab = "bot" }: NewDialogProps) {
  const [tab, setTab] = useState<NewDialogTab>(initialTab);
  const { t } = useT();

  return (
    <div>
      <SegmentedControl
        aria-label={t("dialogs.new.title")}
        value={tab}
        onChange={setTab}
        options={[
          { value: "bot", label: t("dialogs.new.tab.bot") },
          { value: "room", label: t("dialogs.new.tab.room") },
        ]}
      />
      <div className={styles["hb-form-tabs"]} />
      {tab === "bot" ? <NewBotForm /> : <NewRoomForm />}
    </div>
  );
}
