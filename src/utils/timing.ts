/** Determine whether an unknown error represents an abort. */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

/** Wait for a duration, rejecting early when the signal is aborted. */
export function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const cleanup = (): void => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abort);
    };
    const abort = (): void => {
      cleanup();
      reject(
        signal?.reason ??
          new DOMException("The request was aborted.", "AbortError"),
      );
    };
    timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}
