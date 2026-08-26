/**
 * How a `--value` typed at a shell prompt becomes the value a running stage sees.
 *
 * `setStageConsoleVariable` takes `unknown`, so the choice of what to store is
 * the CLI's to make, and the only defensible answer is whatever
 * `LocalVariablesService` would have produced from the same text in a `.env`
 * file. That service reads `JSON.parse(raw)` and falls back to the raw string
 * when the parse throws, so this does the same.
 *
 * The alternative — store every value as a string — is what makes a variable
 * behave differently in a deploy than it does locally, and the failure it causes
 * is silent: `DEMO_ACCESS=true` compared against the boolean `true` is simply
 * false, and the feature it gates stays off with nothing in the log to say why.
 */
export const parseVariableValue = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}
