import type { SidebarSection } from "../../../contracts/desktop-bridge";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js bytes 2325017-2325452
// Ect/Cct: section membership, pinned-agent exclusion, stable section/agent order,
// synthetic __agents__ handling, and empty-section filtering.
// Mac/Windows byte parity for this renderer region is asserted by
// tests/recovery-sidebar-section-projection.test.mjs.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js bytes 2572457-2572518
// The section body exposes the exact empty-state copy used by the renderer.
// @evidence src/app/dist/host/host-main.cjs lines 633565-633611
// src/shared/sidebar-sections.ts: cross-platform section IDs, names, normalization,
// and the final synthetic section record.

export const AGENTS_SECTION_ID = "__agents__";
export const AGENTS_SECTION_NAME = "Unassigned";
export const EMPTY_SECTION_BODY_LABEL = "Drag chats here";

export interface SidebarSectionProjection<Agent extends { id: string }> {
  id: string;
  name: string;
  isSynthetic: boolean;
  isCollapsed: boolean;
  agents: Agent[];
}

export interface SidebarSectionHeaderMetadata {
  id: string;
  label: string;
  count: number;
  isFolded: boolean;
  isLocked: boolean;
  ariaExpanded: boolean;
  dataSectionId: string;
}

/**
 * Projects the shipped section records into the renderer's visible section model.
 * Section and roster order are intentionally not sorted: both are presentation
 * order supplied by the immutable renderer/coordinator state.
 */
export function projectSidebarSections<Agent extends { id: string }>(args: {
  readonly agents: readonly Agent[];
  readonly pinnedIds: readonly string[];
  readonly sections: readonly SidebarSection[];
}): SidebarSectionProjection<Agent>[] {
  const { agents, pinnedIds, sections } = args;
  if (sections.length === 0) return [];

  const pinned = new Set(pinnedIds);
  const unpinnedAgents = agents.filter((agent) => !pinned.has(agent.id));
  const agentToSection = new Map<string, string>();
  for (const section of sections) {
    if (section.id === AGENTS_SECTION_ID) continue;
    for (const agentId of section.agentIds) agentToSection.set(agentId, section.id);
  }

  return sections
    .map((section) => {
      const isSynthetic = section.id === AGENTS_SECTION_ID;
      const sectionAgents = unpinnedAgents.filter((agent) => (
        isSynthetic
          ? !agentToSection.has(agent.id)
          : agentToSection.get(agent.id) === section.id
      ));
      return {
        id: section.id,
        name: section.name,
        isSynthetic,
        isCollapsed: section.isCollapsed,
        agents: sectionAgents
      };
    })
    .filter((section) => section.agents.length > 0 || !section.isSynthetic);
}

export function projectSidebarSectionHeader(section: SidebarSectionProjection<{ id: string }>): SidebarSectionHeaderMetadata {
  return {
    id: section.id,
    label: section.name,
    count: section.agents.length,
    isFolded: section.isCollapsed,
    isLocked: section.isSynthetic,
    ariaExpanded: !section.isCollapsed,
    dataSectionId: section.id
  };
}
