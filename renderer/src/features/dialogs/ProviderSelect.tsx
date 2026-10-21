import type { CSSProperties } from "react";
import { Select } from "../../primitives/index.ts";
import type { SelectOption } from "../../primitives/index.ts";
import { isSelectableProvider, PROVIDERS } from "./provider-catalog.ts";
import styles from "./ProviderSelect.module.css";

const ICON_BASE = `${import.meta.env.BASE_URL}provider-icons/`;

// The glyphs are single-colour SVGs, so each is drawn as a mask and filled with the provider's colour
// (or the text colour for black marks) rather than shown as an image, which would always be black.
function ProviderGlyph({ slug, color, label }: { readonly slug: string | null; readonly color: string | null; readonly label: string }) {
  if (slug == null) {
    return <span className={styles["hb-provider-monogram"]}>{label.slice(0, 1).toUpperCase()}</span>;
  }
  // Absolute, because a relative url() in a custom property resolves against the stylesheet that uses it (assets/), not the page.
  const iconUrl = new URL(`${ICON_BASE}${slug}.svg`, document.baseURI).href;
  const style = { "--hb-provider-glyph": `url("${iconUrl}")`, "--hb-provider-color": color ?? "currentColor" } as CSSProperties;
  return <span className={styles["hb-provider-icon"]} style={style} aria-hidden />;
}

const PROVIDER_OPTIONS: readonly SelectOption[] = PROVIDERS.map((provider) => ({
  value: provider.id,
  label: provider.label,
  icon: <ProviderGlyph slug={provider.iconSlug} color={provider.iconColor} label={provider.label} />,
}));

export interface ProviderSelectProps {
  /** `""` while nothing is picked yet -- shown as `placeholder`, never as a preselected provider. */
  readonly value: string;
  readonly onChange: (providerId: string) => void;
  readonly label?: string;
  readonly placeholder?: string;
}

/** The AI provider picker: a small icon + label per option, a checkmark on the current
 * selection. A thin wrapper over the shared `Select` primitive (content-width panel, narrower than the
 * field) rather than its own popover. An unrecognized `value` shows as unselected, so a new bot always
 * needs an explicit provider pick. */
export function ProviderSelect({ value, onChange, label, placeholder }: ProviderSelectProps) {
  return <Select label={label} value={isSelectableProvider(value) ? value : ""} placeholder={placeholder} onChange={onChange} options={PROVIDER_OPTIONS} panelWidth="content" />;
}
