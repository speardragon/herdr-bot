import rawCatalog from "../../manifests/component-names.json";
import type { InspectedElement } from "../dev/dom-inspector";

export interface RecoveredComponentBoundary {
  symbol: string;
  name: string;
  selector: string;
  line: number;
  confidence: "high" | "medium" | "low";
  evidence: string[];
}

export const recoveredComponentBoundaries = rawCatalog.components as RecoveredComponentBoundary[];

export function matchRecoveredBoundaries(element: InspectedElement): RecoveredComponentBoundary[] {
  return recoveredComponentBoundaries.filter((boundary) => {
    if (!boundary.selector.startsWith(".")) return false;
    return element.classes.includes(boundary.selector.slice(1)) || element.selector.includes(boundary.selector);
  });
}
