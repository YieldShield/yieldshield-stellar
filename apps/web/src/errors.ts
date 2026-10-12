// Pure error classification shared by the network layer and the interface.
// No SDK imports: the main bundle and node tests can load it directly.
type HttpLike = { response?: { status?: number; data?: unknown } } | null;

export const httpStatus = (e: unknown) =>
  (e as HttpLike)?.response?.status;

/** Horizon reports an account that has never been funded as HTTP 404. */
export const isNotFound = (e: unknown) => httpStatus(e) === 404;

export const message = (e: unknown) =>
  e instanceof Error ? e.message : String(e);
