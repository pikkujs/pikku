import { execSync, type ExecSyncOptions } from 'node:child_process'

const ANSI = /\x1b\[[0-9;]*m/g

const decode = (value: unknown): string =>
  (Buffer.isBuffer(value) ? value.toString('utf-8') : String(value ?? ''))
    .replace(ANSI, '')
    .trim()

/**
 * Runs a shell command (normally the pikku CLI) and returns its stdout.
 *
 * Node's own failure for execSync dumps the raw stdout/stderr Buffers and its
 * internals, which buries the one line that says what went wrong. On failure
 * this throws a short Error holding the command, the exit code and the decoded
 * stderr then stdout.
 */
export function execCli(
  command: string,
  options: Omit<ExecSyncOptions, 'encoding'> = {}
): string {
  try {
    return execSync(command, {
      stdio: 'pipe',
      ...options,
      encoding: 'utf-8',
    }) as string
  } catch (error) {
    const failure = error as {
      status?: number | null
      signal?: string | null
      stdout?: unknown
      stderr?: unknown
    }
    const exit =
      failure.status != null
        ? `exit code ${failure.status}`
        : `signal ${failure.signal ?? 'unknown'}`
    const output = [decode(failure.stderr), decode(failure.stdout)]
      .filter(Boolean)
      .join('\n')
    throw new Error(
      `Command failed (${exit}): ${command}${output ? `\n${output}` : ''}`
    )
  }
}
