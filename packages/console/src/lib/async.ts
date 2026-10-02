/**
 * Adapters for passing async functions where a callback returning `void` is
 * expected (React event handlers, router callbacks). A rejection is reported
 * rather than left unhandled.
 */
export const reportAsyncError = (error: unknown): void => {
  console.error(error)
}

export const handleAsync =
  <A extends unknown[]>(fn: (...args: A) => Promise<unknown>) =>
  (...args: A): void => {
    fn(...args).catch(reportAsyncError)
  }
