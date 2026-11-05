/**
 * Generated tests that fail for a reason that cannot be fixed in this suite.
 * Each keeps its assertion and runs as `todo`, so it is reported and stays
 * visible rather than being dropped from the matrix.
 */
export const EXPECTED_FAILURES: ReadonlyArray<{
  matches: RegExp
  why: string
}> = [
  {
    // The trace survives; only the status assertion fails.
    matches: / \/ (dsl|graph)-inline \/ \w[\w-]* \/ workflow-cancelled$/,
    why: 'Not a trace bug. An inline run never rereads its status, so cancelling it mid-step is overwritten: workflow-dsl-pass.ts:88, graph-runner.ts:967 and graph-runner.ts:1268 write `completed` over `cancelled`',
  },
]

/** Why a generated test is expected to fail, if it is. */
export const expectedFailure = (label: string) =>
  EXPECTED_FAILURES.find(({ matches }) => matches.test(label))?.why
