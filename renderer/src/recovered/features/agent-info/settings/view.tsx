import { useEffect, useId, useState, type ReactNode, type RefObject } from "react";
import { t, useLocale } from "../../../../production/locale";
import type { AgentSettingsAgent, AgentSettingsController, AgentSettingsProfile } from "./model";
import { agentSettingsFields, type AgentSettingsFieldKey } from "./fields";
import { EditableField } from "./editable-field";
import { NotificationCard } from "./notification-card";
import "./view.css";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2766045 (Agent Settings view)

export interface AgentSettingsPanelProps {
  readonly controller: AgentSettingsController;
  /** The hero avatar (an already-rendered AgentAvatar, 72px). Omitted → no hero block. */
  readonly avatar?: ReactNode;
  /** Bots only: makes the hero a button that toggles the inline avatar editor. */
  onEditAvatar?(): void;
  readonly avatarTriggerRef?: RefObject<HTMLButtonElement | null>;
  readonly isAvatarEditorOpen?: boolean;
  /** Rendered directly under the hero while the editor is open. */
  readonly avatarEditor?: ReactNode;
}

function profileFor(agent: AgentSettingsAgent): AgentSettingsProfile {
  return { name: agent.name, ...(agent.title === undefined ? {} : { title: agent.title }), description: agent.description };
}

function fieldValue(agent: AgentSettingsAgent, key: AgentSettingsFieldKey): string {
  if (key === "name") return agent.name;
  if (key === "title") return agent.title ?? "";
  return agent.description;
}

function useControllerSnapshot(controller: AgentSettingsController) {
  const [snapshot, setSnapshot] = useState(controller.getSnapshot);
  useEffect(() => controller.subscribe(() => setSnapshot(controller.getSnapshot())), [controller]);
  return snapshot;
}

/**
 * Agent Settings, laid out like the Grok Bot reference: a centered 72px avatar on a faint square,
 * then labeled fields (bots: 이름 / 레이블 (선택사항) / 설명 -- groups: 이름 / 설명, see fields.ts),
 * then, for bots only, the gray 알림 card with a switch. All persistence goes through the
 * controller; this component owns no state beyond each field's in-progress draft.
 */
export function AgentSettingsPanel({ controller, avatar, onEditAvatar, avatarTriggerRef, isAvatarEditorOpen = false, avatarEditor }: AgentSettingsPanelProps) {
  useLocale();
  const { agent, pending, error } = useControllerSnapshot(controller);
  const fieldIdBase = useId();
  const commit = (key: AgentSettingsFieldKey, value: string) => {
    const profile: AgentSettingsProfile = { ...profileFor(agent), [key]: value };
    void controller.updateProfile(profile).catch(() => {});
  };
  const hero = avatar == null ? null : onEditAvatar == null
    ? <div className="sand-agent-settings__hero"><span className="sand-agent-settings__hero-avatar">{avatar}</span></div>
    : <button aria-expanded={isAvatarEditorOpen} aria-label={t("Edit agent avatar")} className="sand-agent-settings__hero" onClick={onEditAvatar} ref={avatarTriggerRef} title={t("Edit agent avatar")} type="button"><span className="sand-agent-settings__hero-avatar">{avatar}</span></button>;
  return <section aria-label={agent.isGroup ? t("Group settings") : t("Agent settings")} className="sand-agent-settings" data-agent-id={agent.id} data-pending={pending ?? undefined}>
    {hero}
    {isAvatarEditorOpen ? avatarEditor : null}
    {agentSettingsFields(agent.isGroup).map((field) => {
      const id = `${fieldIdBase}-${field.key}`;
      return <div className="sand-agent-settings__field" key={field.key}>
        <label className="sand-agent-settings__label" htmlFor={id}>{t(field.label, field.labelKo)}</label>
        <EditableField ariaLabel={t(field.label, field.labelKo)} id={id} initialValue={fieldValue(agent, field.key)} isMultiline={field.isMultiline} isRequired={field.isRequired} onCommit={(value) => commit(field.key, value)} placeholder={t(field.placeholder, field.placeholderKo)} />
      </div>;
    })}
    {agent.isGroup ? null : <NotificationCard isEnabled={agent.notifyOnUpdatesEnabled} isPending={pending != null} onToggle={(next) => void controller.setNotifications(next).catch(() => {})} />}
    {error == null ? null : <div aria-live="polite" className="sand-agent-settings__error" role="status">{error instanceof Error ? error.message : String(error)}</div>}
  </section>;
}
