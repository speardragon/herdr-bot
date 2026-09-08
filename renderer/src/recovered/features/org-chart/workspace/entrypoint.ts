import { defineEntrypoint, type EntrypointAvailability, type EntrypointContext } from "../../../runtime/define-entrypoint";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L523 UTF-8 bytes 5376412 and 5376803

export const ORG_CHART_GATE = "sand_agent_network";

export function orgChartAvailability(context: EntrypointContext): EntrypointAvailability {
  const isEnabled = context.gates.has(ORG_CHART_GATE);
  if (isEnabled && context.hasAgents) return { kind: "available" };
  if (isEnabled) return { kind: "retained", reason: "empty-roster" };
  return { kind: "unavailable", reason: "gate" };
}

export default defineEntrypoint<Record<string, never>>({
  availability: orgChartAvailability,
  loadView: () => import("./view")
});
