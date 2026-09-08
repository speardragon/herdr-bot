export interface InspectedElement {
  tag: string;
  id: string | null;
  classes: string[];
  ariaLabel: string | null;
  text: string;
  selector: string;
}

function selectorFor(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current != null && current !== document.documentElement && parts.length < 5) {
    let part = current.tagName.toLowerCase();
    if (current.id) {
      part += `#${CSS.escape(current.id)}`;
      parts.unshift(part);
      break;
    }
    const stableClass = [...current.classList].find((name) => name.startsWith("sand-") && !/^sand-[a-z0-9]{6,}$/.test(name));
    if (stableClass) part += `.${CSS.escape(stableClass)}`;
    parts.unshift(part);
    current = current.parentElement;
  }
  return parts.join(" > ");
}

export function describeElement(element: Element): InspectedElement {
  return {
    tag: element.tagName.toLowerCase(),
    id: element.id || null,
    classes: [...element.classList],
    ariaLabel: element.getAttribute("aria-label"),
    text: (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 160),
    selector: selectorFor(element)
  };
}

export function attachDomInspector(onPick: (element: InspectedElement) => void): () => void {
  const highlight = document.createElement("div");
  highlight.dataset.sandDevtools = "true";
  Object.assign(highlight.style, {
    position: "fixed",
    zIndex: "2147483645",
    pointerEvents: "none",
    border: "2px solid #c9ff4a",
    background: "rgba(201, 255, 74, 0.09)",
    borderRadius: "4px"
  });
  document.documentElement.append(highlight);

  const move = (event: MouseEvent) => {
    const target = event.composedPath().find((candidate) => candidate instanceof Element) as Element | undefined;
    if (target == null || target.closest("[data-sand-devtools='true']")) return;
    const rect = target.getBoundingClientRect();
    Object.assign(highlight.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });
  };
  const pick = (event: MouseEvent) => {
    const target = event.composedPath().find((candidate) => candidate instanceof Element) as Element | undefined;
    if (target == null || target.closest("[data-sand-devtools='true']")) return;
    event.preventDefault();
    event.stopPropagation();
    onPick(describeElement(target));
  };
  document.addEventListener("mousemove", move, true);
  document.addEventListener("click", pick, true);
  return () => {
    document.removeEventListener("mousemove", move, true);
    document.removeEventListener("click", pick, true);
    highlight.remove();
  };
}
