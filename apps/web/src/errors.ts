// Pure error classification shared by the network layer and the interface.
// No SDK imports: the main bundle and node tests can load it directly.
type HttpLike = { response?: { status?: number; data?: unknown } } | null;

export const httpStatus = (e: unknown) =>
  (e as HttpLike)?.response?.status;

/** Horizon reports an account that has never been funded as HTTP 404. */
export const isNotFound = (e: unknown) => httpStatus(e) === 404;

export const message = (e: unknown) =>
  e instanceof Error ? e.message : String(e);

/**
 * A read or transaction touches archived contract storage. The opaque
 * preamble (from simulation) is what a restore transaction needs.
 */
export function restoreRequired(text: string, preamble: unknown) {
  return Object.assign(new Error(text), { restorePreamble: preamble });
}
export const restorePreambleOf = (e: unknown): unknown =>
  e && typeof e === "object" && "restorePreamble" in e
    ? (e as { restorePreamble: unknown }).restorePreamble
    : undefined;
