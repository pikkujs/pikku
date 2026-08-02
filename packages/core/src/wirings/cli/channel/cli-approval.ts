import type { ApprovalRequester } from '../../channel/channel-rpc.js'

/**
 * How much a client will let a server do without asking.
 *
 * The tiers are meaningful here in a way they would not be for an agent: the
 * caller is a deterministic program whose source can be read, so "these calls
 * are always fine" is a statement someone can actually justify. A model gets no
 * equivalent, which is why agent tools have no auto tier.
 *
 * - `prompt`   — ask a person about anything not classified `needsApproval: false`.
 * - `auto`     — run the classified-safe set, refuse the rest without asking.
 * - `dangerous`— run everything.
 */
export type ApprovalMode = 'prompt' | 'auto' | 'dangerous'

export const APPROVAL_FLAGS = {
  auto: '--auto-approve',
  dangerous: '--dangerously-auto-approve',
} as const

/**
 * Reads the approval flags out of argv, returning the mode and argv without
 * them.
 *
 * They are stripped because the server owns the command tree and would
 * otherwise be handed two arguments it has never heard of. The decision is the
 * client's alone — a flag that reached the server could be honoured by the
 * server, which is the party being protected against.
 */
export const takeApprovalFlags = (
  args: string[],
  env: Record<string, string | undefined> = process.env
): { mode: ApprovalMode; args: string[] } => {
  const remaining = args.filter(
    (arg) => arg !== APPROVAL_FLAGS.auto && arg !== APPROVAL_FLAGS.dangerous
  )

  const dangerous =
    args.includes(APPROVAL_FLAGS.dangerous) ||
    env.PIKKU_DANGEROUSLY_AUTO_APPROVE === '1'
  const auto =
    args.includes(APPROVAL_FLAGS.auto) || env.PIKKU_AUTO_APPROVE === '1'

  return {
    mode: dangerous ? 'dangerous' : auto ? 'auto' : 'prompt',
    args: remaining,
  }
}

/**
 * Asks on the terminal, once per call, with `a` remembering the answer for the
 * rest of this run.
 *
 * `a` is scoped to the one capability rather than to the session: "stop asking
 * me about this" is a judgement about a particular thing the user just read,
 * and widening it to everything would quietly turn an interactive run into
 * `--dangerously-auto-approve`. Nothing is written to disk — a decision that
 * outlives the process is one nobody remembers making.
 */
export const createTerminalApprover = ({
  input = process.stdin,
  output = process.stderr,
  signal,
}: {
  input?: NodeJS.ReadStream
  output?: NodeJS.WritableStream
  /** Aborted when the run ends, so a prompt nobody can answer stops waiting. */
  signal?: AbortSignal
} = {}): ApprovalRequester => {
  const allowed = new Set<string>()

  return async ({ funcName, description }) => {
    if (allowed.has(funcName) || signal?.aborted) {
      return allowed.has(funcName)
    }

    // The prompt goes to stderr so a command whose stdout is being piped or
    // parsed still shows it, rather than corrupting the stream it is asking
    // about.
    output.write(
      `\nThe server is asking to run "${funcName}" on this machine.\n` +
        (description ? `  ${description}\n` : '') +
        `Allow? [y]es / [n]o / [a]lways for "${funcName}": `
    )

    const answer = await new Promise<string>((resolve) => {
      const done = (value: string) => {
        input.off('data', onData)
        signal?.removeEventListener('abort', onAbort)
        // Reading resumes stdin, which holds the event loop open. A run that
        // ends with a prompt still on screen would otherwise never exit.
        input.pause?.()
        resolve(value)
      }
      const onData = (chunk: Buffer | string) =>
        done(String(chunk).trim().toLowerCase())
      // An aborted prompt is a refusal: the command it was asked on behalf of
      // is already over, and there is nothing left to permit.
      const onAbort = () => done('n')

      input.on('data', onData)
      signal?.addEventListener('abort', onAbort, { once: true })
    })

    if (answer === 'a' || answer === 'always') {
      allowed.add(funcName)
      return true
    }
    return answer === 'y' || answer === 'yes'
  }
}

/**
 * The approver for a mode, or undefined when nothing may be approved.
 *
 * Undefined is what the responder reads as "there is nobody to ask", so a
 * capability needing approval is refused rather than run. That is deliberately
 * what a non-interactive run gets by default: CI is exactly where an unattended
 * push would otherwise happen, and defaulting it to yes would make the whole
 * mechanism a formality.
 */
export const approverForMode = (
  mode: ApprovalMode,
  {
    isTTY = process.stdin.isTTY,
    warn = console.error,
    signal,
  }: {
    isTTY?: boolean
    warn?: (message: string) => void
    signal?: AbortSignal
  } = {}
): ApprovalRequester | undefined => {
  if (mode === 'dangerous') {
    // Said once, on stderr, so the log of a run that went wrong records that
    // every capability on it was permitted without anyone being asked.
    warn(
      `${APPROVAL_FLAGS.dangerous}: every capability this client exposes will run without asking.`
    )
    return () => true
  }

  if (mode === 'auto' || !isTTY) {
    return undefined
  }

  return createTerminalApprover({ signal })
}
