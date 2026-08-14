/**
 * Retry with exponential backoff. Used to ride out transient AI provider
 * errors (429 rate limits, 503 overloaded) instead of failing the whole
 * conversation (risk #6). `sleep` is injectable so tests run instantly.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    retries?: number;
    baseMs?: number;
    shouldRetry?: (err: unknown) => boolean;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const baseMs = opts.baseMs ?? 400;
  const shouldRetry = opts.shouldRetry ?? (() => true);
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) throw err;
      await sleep(baseMs * 2 ** attempt);
      attempt++;
    }
  }
}
