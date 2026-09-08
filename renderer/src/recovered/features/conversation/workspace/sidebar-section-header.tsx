import type { ReactNode } from "react";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2572046 (Zbe section-header owner; Mac SHA256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2573777 (sand-agents-section__header carrier; Mac SHA256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=3270766 (Zbe section-header owner; Windows SHA256 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=3272688 (sand-agents-section__header carrier; Windows SHA256 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5)

export interface SidebarSectionHeaderProps {
  readonly label: string;
  readonly count: number;
  readonly isFolded: boolean;
  readonly isLocked?: boolean;
  readonly dataSectionId: string;
  readonly renameField?: ReactNode;
  readonly onClick: () => void;
}

/** The shipped Zbe header: folded sections expose their count and the chevron carrier. */
export function SidebarSectionHeader({ label, count, isFolded, isLocked = false, dataSectionId, renameField, onClick }: SidebarSectionHeaderProps) {
  void isLocked;
  return <button
    aria-expanded={!isFolded}
    className="sand-agents-section__header"
    data-section-id={dataSectionId}
    onClick={onClick}
    type="button"
  >
    {renameField ?? <span>{label}</span>}
    {isFolded ? <span>{count}</span> : null}
    <span aria-hidden="true" data-icon-name="chevron-right" data-size="sm" />
  </button>;
}
