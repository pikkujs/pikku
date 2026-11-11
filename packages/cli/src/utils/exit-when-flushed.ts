/**
 * Ends the process once everything already written to stdout has left it.
 * stdout is asynchronous when it is a pipe, so a bare `process.exit` cut
 * `pikku meta context --json | jq` off at the 64 KB pipe buffer. An empty
 * write's callback runs after the writes before it.
 */
export const exitWhenFlushed = (code: number): void => {
  process.stdout.write('', () => process.exit(code))
}
