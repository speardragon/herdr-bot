import { useEffect, useState } from "react";
import { useStoreContext } from "../../data/store/StoreProvider.tsx";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { Checkbox, Select } from "../../primitives/index.ts";
import type { AdoptableAgent } from "../../data/types.ts";
import styles from "./AdoptAgentSection.module.css";

export interface AdoptAgentSectionProps {
  readonly adoptPaneId: string | null;
  readonly onChange: (adoptPaneId: string | null) => void;
}

/** "Adopt a running agent" (`herdrBot.listAdoptable`/`adoptPaneId`) -- no UI entry point exists for this
 * elsewhere, so it's designed fresh here. Listing herdr panes not yet a bot; picking one disables every
 * other launch field in the form (an adopted bot keeps whatever that pane was already running). */
export function AdoptAgentSection({ adoptPaneId, onChange }: AdoptAgentSectionProps) {
  const { client } = useStoreContext();
  const { t } = useT();
  const [agents, setAgents] = useState<readonly AdoptableAgent[] | null>(null);
  const [enabled, setEnabled] = useState(adoptPaneId != null);

  useEffect(() => {
    let cancelled = false;
    void client.call("bot.listAdoptable", undefined).then((list) => {
      if (!cancelled) setAgents(list);
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <div className={styles["hb-adopt"]}>
      <Checkbox
        checked={enabled}
        onChange={(event) => {
          const next = event.target.checked;
          setEnabled(next);
          if (!next) onChange(null);
          else if (agents != null && agents.length > 0) onChange(agents[0]!.paneId);
        }}
      >
        {t("dialogs.new.adopt")}
      </Checkbox>
      {enabled &&
        (agents == null ? null : agents.length === 0 ? (
          <div className={styles["hb-adopt-empty"]}>{t("dialogs.new.adoptEmpty")}</div>
        ) : (
          <Select
            label={t("dialogs.new.adoptPick")}
            value={adoptPaneId ?? agents[0]!.paneId}
            onChange={onChange}
            options={agents.map((agent) => ({ value: agent.paneId, label: `${agent.name ?? agent.paneId} — ${agent.provider ?? "?"} (${agent.cwd ?? "?"})` }))}
          />
        ))}
    </div>
  );
}
