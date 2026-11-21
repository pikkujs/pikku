import { join } from 'node:path'
import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { CloudPreconditionError } from '@pikku/cli/addon-support'
import { dim, safe } from '@pikku/cli/addon-support'
import {
  ChangesRunner,
  MAX_PARALLEL,
  gitDirOf,
  pikkuCheckoutOf,
  processCommands,
  shellLauncher,
  type LocalCli,
  type RunnerEvent,
} from '../runner/index.js'

export const RUN_EXIT_NOT_DONE = 1

export const ChangesRunInput = z.object({
  agent: z.string(),
  parallel: z.number().int().min(1).max(MAX_PARALLEL).optional(),
  tries: z.number().int().min(1).optional(),
  stallMinutes: z.number().min(0).optional(),
  maxMinutes: z.number().min(0).optional(),
})

export const ChangesRunOutput = z.object({
  ok: z.boolean(),
  reason: z.string(),
  merged: z.array(z.string()),
  turns: z.number(),
})

/** One line per event; an error is marked so it stands out in a log. */
export const eventLine = (event: RunnerEvent): string =>
  `${event.level === 'error' ? '! ' : ''}${event.text}`

/**
 * The local CLI build worktrees are relinked to: PIKKU_CLI_BIN or this CLI,
 * when it was built in a pikku checkout (LAB_PIKKU_DIR, or the folder above
 * packages/cli). A published CLI has no checkout, and worktrees get a plain
 * `bun install`.
 */
const localCliOf = (
  env: NodeJS.ProcessEnv
): { bin: string; local?: LocalCli } => {
  const bin = env.PIKKU_CLI_BIN || process.argv[1]!
  const checkout = env.LAB_PIKKU_DIR || pikkuCheckoutOf(bin)
  const list = (value?: string) => value?.split(/[\s,]+/).filter(Boolean)
  return {
    bin,
    local: checkout
      ? {
          bin,
          checkout,
          relinkExtra: list(env.PIKKU_BUILDER_RELINK_EXTRA),
          dedupe: list(env.LAB_PIKKU_DEDUPE),
        }
      : undefined,
  }
}

/**
 * Builds the local changes queue with agents, up to --parallel at once, each
 * in its own changeset worktree, until nothing planned is left or the limit
 * is hit. The agent is a shell command: it gets the prompt on stdin and its
 * change in PIKKU_CHANGE_ID, PIKKU_CHANGESET_GROUP and PIKKU_CHANGESET_WORKTREE.
 * PIKKU_BUILDER_WORKTREE_SETUP and PIKKU_BUILDER_WORKTREE_CHECK replace the
 * setup and check of a checkout ('' is none); PIKKU_BUILDER_SELF_CHECK=0 skips
 * the startup check.
 */
export const ChangesRun = pikkuSessionlessFunc({
  description:
    'Build the changes queue with parallel agents in changeset worktrees until nothing is left or the limit is hit.',
  input: ChangesRunInput,
  output: ChangesRunOutput,
  func: async (_services, input) => {
    const env = process.env
    const { bin, local } = localCliOf(env)
    const commands = processCommands(bin)
    const top = await commands.git(process.cwd(), [
      'rev-parse',
      '--show-toplevel',
    ])
    if (top.code)
      throw new CloudPreconditionError(
        'pikku changes run works in a git checkout.'
      )
    const cwd = top.output
    const state = join(await gitDirOf(cwd), 'pikku-run')
    const runner = new ChangesRunner(
      {
        launcher: shellLauncher(input.agent, { logDir: join(state, 'logs') }),
        commands,
        onEvent: (event) => console.log(eventLine(event)),
      },
      {
        cwd,
        parallel: input.parallel ?? MAX_PARALLEL,
        tries: input.tries,
        stallMinutes: input.stallMinutes,
        maxMinutes: input.maxMinutes,
        localCli: local,
        setupCommand: env.PIKKU_BUILDER_WORKTREE_SETUP,
        checkCommand: env.PIKKU_BUILDER_WORKTREE_CHECK,
        selfCheck: env.PIKKU_BUILDER_SELF_CHECK !== '0',
        browser: env.PLAYWRIGHT_CHROMIUM_PATH || env.PIKKU_CHROMIUM,
        shimDir: join(state, 'bin'),
      }
    )
    const interrupt = () =>
      runner.stop(
        'Interrupted: the running agents were stopped and their leases given back.'
      )
    process.once('SIGINT', interrupt)
    process.once('SIGTERM', interrupt)
    try {
      const result = await runner.run()
      if (!result.ok) process.exitCode = RUN_EXIT_NOT_DONE
      return result
    } finally {
      process.off('SIGINT', interrupt)
      process.off('SIGTERM', interrupt)
    }
  },
})

export const renderChangesRun = (
  _s: unknown,
  result: z.infer<typeof ChangesRunOutput>
): void => {
  console.log(`${result.ok ? 'Done' : 'Stopped'}: ${safe(result.reason)}`)
  console.log(
    dim(`${result.merged.length} merged, ${result.turns} agent turn(s)`)
  )
}
