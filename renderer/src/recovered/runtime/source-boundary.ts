// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L20094-L20098
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#L137792-L137795

export interface SourceFailureDetail extends Record<string, unknown> {
  code: string;
}

export class SourceFailure extends Error {
  constructor(readonly failure: SourceFailureDetail, message = failure.code) {
    super(message);
    this.name = "SourceFailure";
  }
}

export function isSourceRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
