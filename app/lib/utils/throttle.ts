/** Returns a throttled version of `fn` that runs at most once per `ms` milliseconds.
 *  The last call is always delivered (trailing edge): if multiple calls arrive during
 *  the cooldown window, the most recent args are stored and delivered when the timer fires.
 *  Call `.cancel()` on the returned function to clear any pending trailing invocation. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function throttle<T extends (...args: any[]) => void>(
  fn: T,
  ms: number,
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let lastRun = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Parameters<T> | null = null;

  const throttled = (...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = ms - (now - lastRun);

    if (remaining <= 0) {
      if (timer) { clearTimeout(timer); timer = null; }
      lastRun = now;
      pendingArgs = null;
      fn(...args);
    } else {
      // Always store the latest args so trailing edge delivers the most recent call
      pendingArgs = args;
      if (!timer) {
        timer = setTimeout(() => {
          lastRun = Date.now();
          timer = null;
          if (pendingArgs) {
            fn(...pendingArgs);
            pendingArgs = null;
          }
        }, remaining);
      }
    }
  };

  throttled.cancel = () => {
    if (timer) { clearTimeout(timer); timer = null; }
  };

  return throttled;
}
