import type { ApprovalRequester } from '../../channel/channel-rpc.js'

/**
 * - `prompt`   — ask about anything not classified `needsApproval: false`.
 * - `auto`     — run the classified-safe set, refuse the rest without asking.
 * - `dangerous`— run everything.
 */
export type ApprovalMode = 'prompt' | 'auto' | 'dangerous'

export const APPROVAL_FLAGS = {
  auto: '--auto-approve',
  dangerous: '--dangerously-auto-approve',
} as const

/**
 * Stripped from argv, not just read: the server owns the command tree and has
 * never heard of these, and a flag the server can see is one it could act on.
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
 * `a` is scoped to the one capability and to this run: widening it to every
 * capability would quietly turn an interactive run into
 * `--dangerously-auto-approve`, and persisting it would outlive anyone's memory
 * of agreeing.
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

  const ask: ApprovalRequester = async ({ funcName, description }) => {
    if (allowed.has(funcName) || signal?.aborted) {
      return allowed.has(funcName)
    }

    // stderr, so a command whose stdout is piped still shows the prompt rather
    // than corrupting the stream it is asking about.
    output.write(
      `\nThe server is asking to run "${funcName}" on this machine.\n` +
        (description ? `  ${description}\n` : '') +
        `Allow? [y]es / [n]o / [a]lways for "${funcName}": `
    )

    const answer = await new Promise<string>((resolve) => {
      const done = (value: string) => {
        input.off('data', onData)
        signal?.removeEventListener('abort', onAbort)
        // Reading resumed stdin, which holds the event loop open.
        input.pause?.()
        resolve(value)
      }
      const onData = (chunk: Buffer | string) =>
        done(String(chunk).trim().toLowerCase())
      // An aborted prompt is a refusal: its command is already over.
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

  // Requests are dispatched without awaiting, so two can be in flight at once.
  // Unserialized, both prompts print interleaved and the first keystroke
  // answers both — approving something the user never read.
  let queue: Promise<unknown> = Promise.resolve()
  return (request) => {
    const answered = queue.then(() => ask(request))
    queue = answered.catch(() => {})
    return answered
  }
}

/**
 * Undefined reads as "nobody to ask", which refuses rather than runs. That is
 * what a non-interactive run gets: CI is exactly where an unattended push would
 * otherwise happen.
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
    // Once, on stderr, so the log of a run that went wrong records it.
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
