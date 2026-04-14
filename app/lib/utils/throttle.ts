/** Returns a throttled version of `fn` that runs at most once per `ms` milliseconds.
 *  The last call is always delivered (trailing edge).
 *  Call `.cancel()` to clear any pending trailing-edge timer. */
export function throttle<T extends (...args: Parameters<T>) => void>(
  fn: T,
  ms: number,
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let lastRun = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const throttled = (...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = ms - (now - lastRun);

    if (remaining <= 0) {
      if (timer) { clearTimeout(timer); timer = null; }
      lastRun = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        lastRun = Date.now();
        timer = null;
        fn(...args);
      }, remaining);
    }
  };

  throttled.cancel = () => {
    if (timer) { clearTimeout(timer); timer = null; }
  };

  return throttled;
}
