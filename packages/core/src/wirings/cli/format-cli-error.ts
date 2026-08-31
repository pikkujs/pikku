import { isExpectedError } from '../../errors/error-handler.js'

/**
 * A `PikkuFetchError` — recognised by shape, not by `instanceof`, because
 * `@pikku/client-fetch` depends on core and core cannot depend back on it.
 */
type FetchFailure = {
  status: number
  statusText: string
  response: { url?: string }
  message?: string
}

const isFetchFailure = (error: unknown): error is FetchFailure => {
  const candidate = error as Partial<FetchFailure> | null
  return (
    typeof candidate?.status === 'number' &&
    typeof candidate?.statusText === 'string' &&
    typeof candidate?.response === 'object' &&
    candidate.response !== null
  )
}

/**
 * The user asked to see the machinery. `--verbose`/`-v` is the flag the CLI
 * already documents; `PIKKU_DEBUG` is for the times the flag cannot be typed —
 * a command that does not declare the option, or a CLI run from a script.
 */
export const wantsStackTrace = (
  args: string[],
  env: Record<string, string | undefined> = process.env
): boolean =>
  args.includes('--verbose') ||
  args.includes('-v') ||
  (env.PIKKU_DEBUG !== undefined &&
    env.PIKKU_DEBUG !== '' &&
    env.PIKKU_DEBUG !== '0')

/**
 * What the CLI prints when a command throws.
 *
 * A stack trace is an answer to "which line of pikku broke", and almost every
 * failure a user actually hits is not that question: a missing role, an expired
 * token, a gateway that is down. Those errors are written to be read, so the
 * message alone is the whole output — an expected error is one deliberately
 * raised as `PikkuError` (or carrying `expected: true`), and everything else
 * keeps its stack, because an unexpected `TypeError` with its frames removed is
 * a bug nobody can diagnose.
 *
 * A stack already begins with `Name: message`, so it is returned as-is: the
 * `console.error('Error:', error)` this replaced produced the doubled
 * `Error: Error: …` prefix that made even real traces look broken.
 */
export const formatCLIError = (
  error: unknown,
  { verbose = false }: { verbose?: boolean } = {}
): string => {
  if (isFetchFailure(error)) {
    return formatFetchFailure(error, verbose)
  }

  const stack = (error as { stack?: unknown } | null)?.stack
  const message = (error as { message?: unknown } | null)?.message

  if (!isExpectedError(error)) {
    return typeof stack === 'string' && stack ? stack : String(error)
  }

  const text = typeof message === 'string' && message ? message : String(error)
  return verbose && typeof stack === 'string' && stack
    ? `${text}\n${stack}`
    : text
}

/**
 * A failed HTTP call, as the line the user needs: which status, from which URL.
 *
 * Never the `Response` itself. Node inspects an error's own properties when it
 * prints one, so a thrown fetch error used to dump the headers, the body stream
 * and the redirect flags — pages of output whose only real content was the
 * status code.
 */
const formatFetchFailure = (error: FetchFailure, verbose: boolean): string => {
  const url = error.response?.url
  const where = url ? ` from ${url}` : ''
  const summary = `${error.status} ${error.statusText}${where}`
  const message = error.message
  const text =
    message && message !== error.statusText
      ? `${message}\n  ${summary}`
      : summary
  const stack = (error as { stack?: unknown }).stack
  return verbose && typeof stack === 'string' && stack
    ? `${text}\n${stack}`
    : text
}
