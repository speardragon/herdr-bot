import type { ReactElement } from "react";

/**
 * @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa
 * @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5122724
 * @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5123042
 * Immutable branch: message.type === "permission-request" renders the
 * permission title in a retired permission-request wrapper. The wrapper owns
 * timestamp/group placement; this leaf deliberately has no bridge or action.
 */
export const PERMISSION_REQUEST_LEAF_CONTRACT = Object.freeze({
  messageType: "permission-request" as const,
  variant: "retired" as const,
  wrapperClassName: "sand-permission-request-wrap" as const,
});

export interface PermissionRequestLeafProps {
  readonly title: string;
  readonly timestampMs?: number;
  readonly isGroupStart?: boolean;
}

export interface PermissionRequestLeafInput {
  readonly permission?: unknown;
  readonly timestampMs?: unknown;
  readonly isGroupStart?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Typed handoff for a later transcript wrapper. It intentionally reads only
 * permission.title and the wrapper-provided timestamp/group-start fields.
 */
export function projectPermissionRequestLeaf(
  value: unknown,
): PermissionRequestLeafProps | null {
  if (!isRecord(value) || !isRecord(value.permission)) return null;

  const title = value.permission.title;
  if (typeof title !== "string" || title.trim().length === 0) return null;

  const timestampMs = value.timestampMs;
  if (
    timestampMs !== undefined &&
    (typeof timestampMs !== "number" || !Number.isFinite(timestampMs))
  ) {
    return null;
  }

  const isGroupStart = value.isGroupStart;
  if (isGroupStart !== undefined && typeof isGroupStart !== "boolean") {
    return null;
  }

  return {
    title,
    ...(timestampMs === undefined ? {} : { timestampMs }),
    ...(isGroupStart === undefined ? {} : { isGroupStart }),
  };
}

/**
 * Read-only leaf for the shipped retired permission-request branch.
 * No permission bridge, request id, or action callback belongs here.
 */
export function PermissionRequestLeaf({
  title,
  timestampMs,
  isGroupStart,
}: PermissionRequestLeafProps): ReactElement | null {
  if (typeof title !== "string" || title.trim().length === 0) return null;

  return (
    <div
      className={PERMISSION_REQUEST_LEAF_CONTRACT.wrapperClassName}
      data-group-start={isGroupStart === true ? "true" : undefined}
      data-timestamp-ms={timestampMs}
    >
      <span>{title}</span>
    </div>
  );
}

export default PermissionRequestLeaf;
