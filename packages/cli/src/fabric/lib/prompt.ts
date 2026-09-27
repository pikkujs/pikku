import { createInterface } from 'node:readline/promises'
import { createInterface as createLineInterface } from 'node:readline'
import { stdin, stdout } from 'node:process'
import { FabricPreconditionError } from './errors.js'

/**
 * Read the first line stdin has to offer, or `null` if it has none.
 *
 * Resolves on the first newline rather than on EOF, so a pipe that stays open
 * after the value has been written (a harness holding the write end, `cat |`)
 * does not hang the command. `terminal: false` matters: readline's terminal
 * mode tries to drive a tty it does not have, and on a closed stdin the
 * `question()` promise it returns never settles at all — which is how
 * `pikku fabric secrets set NAME < /dev/null` used to end in node's
 * "Detected unsettled top-level await" warning instead of an error.
 */
const readFirstLine = async (): Promise<string | null> => {
  const rl = createLineInterface({ input: stdin, terminal: false })
  try {
    return await new Promise<string | null>((resolve) => {
      rl.once('line', (line) => resolve(line))
      rl.once('close', () => resolve(null))
    })
  } finally {
    rl.close()
  }
}

/**
 * Ask for a value that should not end up in shell history.
 *
 * With a tty this is a prompt. Without one — piped input, CI, an agent — the
 * value is read from stdin instead, because scripting `pikku fabric secrets
 * set` is a reasonable thing to want, and because a prompt with nobody to
 * answer it is a hang. If stdin is closed or empty, `nonInteractiveHint` tells
 * the caller which flag to reach for; it is raised as a `PikkuError` so
 * `formatCLIError` prints that sentence and nothing else.
 */
export async function promptSecret(
  label: string,
  { nonInteractiveHint }: { nonInteractiveHint: string }
): Promise<string> {
  if (!stdin.isTTY) {
    const piped = await readFirstLine()
    const value = piped?.trim() ?? ''
    if (!value) {
      throw new FabricPreconditionError(
        `${label}: stdin is not a tty and nothing was piped in.\n${nonInteractiveHint}`
      )
    }
    return value
  }

  const rl = createInterface({ input: stdin, output: stdout, terminal: true })
  // Best-effort masking — the readline API doesn't suppress echo natively;
  // for hardened input you'd want `read -s` or a tty trick, but for our
  // CLI the standard prompt is fine and matches what wrangler does.
  process.stdout.write(`${label}: `)
  try {
    // `question()` never rejects when the stream ends under it, so the close is
    // raced explicitly: ^D at a prompt is an abort, not an infinite wait.
    const value = await Promise.race([
      rl.question(''),
      new Promise<null>((resolve) => rl.once('close', () => resolve(null))),
    ])
    if (value === null) {
      throw new FabricPreconditionError(
        `${label}: input closed before a value was given.\n${nonInteractiveHint}`
      )
    }
    return value.trim()
  } finally {
    rl.close()
  }
}

/**
 * Classic yes/no confirmation. Returns `defaultYes` on an empty answer.
 * Callers must gate on `process.stdin.isTTY` first — there is no human to
 * answer in a non-interactive session, so prompting there would hang. The
 * guard below is the backstop for a caller that forgets: a refusal naming the
 * question beats a process that never returns.
 */
export async function promptConfirm(
  label: string,
  defaultYes = false
): Promise<boolean> {
  if (!stdin.isTTY) {
    throw new FabricPreconditionError(
      `Cannot ask "${label}" — stdin is not a tty. Re-run interactively, or pass the flag that answers it (--force / --auto-approve / --yes).`
    )
  }
  const rl = createInterface({ input: stdin, output: stdout })
  try {
    const answer = await Promise.race([
      rl.question(`${label} [${defaultYes ? 'Y/n' : 'y/N'}] `),
      new Promise<null>((resolve) => rl.once('close', () => resolve(null))),
    ])
    if (answer === null) return false
    const normalized = answer.trim().toLowerCase()
    if (!normalized) return defaultYes
    return normalized === 'y' || normalized === 'yes'
  } finally {
    rl.close()
  }
}
