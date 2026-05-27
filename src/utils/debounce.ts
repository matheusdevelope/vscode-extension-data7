/**
 * Returns a function that delays calling `fn` until `delayMs` has elapsed since
 * the last invocation. Calls share the latest arguments. Useful for collapsing
 * bursts of `onDidChangeTextDocument` or `FileSystemWatcher` events before
 * triggering expensive work.
 *
 * Returned function has a `cancel()` method to drop any pending invocation.
 */
export interface DebouncedFunction<TArgs extends unknown[]> {
  (...args: TArgs): void;
  cancel(): void;
}

export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs: number,
): DebouncedFunction<TArgs> {
  let timer: NodeJS.Timeout | undefined;

  const debounced = ((...args: TArgs) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, delayMs);
  }) as DebouncedFunction<TArgs>;

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  return debounced;
}

/**
 * Same idea as {@link debounce}, but the debounced function is keyed by a string
 * derived from the call (e.g. `Uri.toString()`), so concurrent flows for
 * different documents/files don't cancel each other.
 */
export function debounceKeyed<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs: number,
  keySelector: (...args: TArgs) => string,
): (...args: TArgs) => void {
  const timers = new Map<string, NodeJS.Timeout>();

  return (...args: TArgs) => {
    const key = keySelector(...args);
    const existing = timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    const handle = setTimeout(() => {
      timers.delete(key);
      fn(...args);
    }, delayMs);
    timers.set(key, handle);
  };
}
