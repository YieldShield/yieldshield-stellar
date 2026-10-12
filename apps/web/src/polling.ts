// Small timing helpers for the network layer. No SDK imports, so node tests
// can drive them with a fake clock.
type Clock = {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};
const realSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Polls `read` until `done` accepts a value or `deadline` (epoch ms) passes.
 * A failed read (RPC blip, HTTP 5xx) does not end the wait: it is retried
 * with exponential backoff up to `maxBackoff`, and a later success resets
 * the interval. Resolves with the last value and the last read error, if
 * the final attempt failed.
 */
export async function pollUntil<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  {
    deadline,
    interval = 1500,
    maxBackoff = 8000,
    now = Date.now,
    sleep = realSleep,
  }: Clock & { deadline: number; interval?: number; maxBackoff?: number },
): Promise<{ value?: T; error?: unknown; timedOut: boolean }> {
  let delay = interval;
  let value: T | undefined;
  let error: unknown;
  for (;;) {
    await sleep(Math.max(0, Math.min(delay, deadline - now())));
    try {
      value = await read();
      error = undefined;
      if (done(value)) return { value, timedOut: false };
      delay = interval;
    } catch (e) {
      error = e;
      delay = Math.min(delay * 2, maxBackoff);
    }
    if (now() >= deadline) return { value, error, timedOut: true };
  }
}

/**
 * Runs `fn`; when it throws a retryable error (an RPC or Horizon blip), waits
 * briefly and runs it exactly once more.
 */
export async function retryOnce<T>(
  fn: () => Promise<T>,
  {
    retryable = () => true,
    delay = 600,
    sleep = realSleep,
  }: { retryable?: (e: unknown) => boolean; delay?: number } & Clock = {},
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!retryable(e)) throw e;
    await sleep(delay);
    return fn();
  }
}
