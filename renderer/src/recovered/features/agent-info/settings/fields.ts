// herdr-bot: the Agent Settings field list, kept pure (no runtime imports) so node:test can lock
// the bot-vs-group difference from the Grok Bot reference: bots get 이름 / 레이블 (선택사항) / 설명,
// groups get 이름 / 설명 only. Labels and placeholders are English t() keys with Korean fallbacks.

export type AgentSettingsFieldKey = "name" | "title" | "description";

export interface AgentSettingsFieldSpec {
  readonly key: AgentSettingsFieldKey;
  readonly label: string;
  readonly labelKo: string;
  readonly placeholder: string;
  readonly placeholderKo: string;
  readonly isMultiline: boolean;
  readonly isRequired: boolean;
}

const NAME: AgentSettingsFieldSpec = { key: "name", label: "Name", labelKo: "이름", placeholder: "Bob", placeholderKo: "봇 이름", isMultiline: false, isRequired: true };
const GROUP_NAME: AgentSettingsFieldSpec = { ...NAME, placeholder: "Group name", placeholderKo: "그룹 이름" };
const LABEL: AgentSettingsFieldSpec = { key: "title", label: "Label (optional)", labelKo: "레이블 (선택사항)", placeholder: "Research, marketing, admin", placeholderKo: "리서치, 마케팅, 관리", isMultiline: false, isRequired: false };
const DESCRIPTION: AgentSettingsFieldSpec = { key: "description", label: "Description", labelKo: "설명", placeholder: "What this agent is for", placeholderKo: "봇의 역할과 관점을 입력하세요", isMultiline: true, isRequired: false };
const GROUP_DESCRIPTION: AgentSettingsFieldSpec = { ...DESCRIPTION, placeholder: "What this group is for", placeholderKo: "이 그룹의 역할" };

export function agentSettingsFields(isGroup: boolean): readonly AgentSettingsFieldSpec[] {
  return isGroup ? [GROUP_NAME, GROUP_DESCRIPTION] : [NAME, LABEL, DESCRIPTION];
}
