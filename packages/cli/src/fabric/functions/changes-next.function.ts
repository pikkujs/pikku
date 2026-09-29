import { z } from 'zod'
import { CLIError } from '@pikku/core/cli'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { changesContext, requireProjectId } from '../lib/changes.js'
import {
  FabricAuthError,
  waitForNext,
  type NextResult,
} from '../lib/changes-next.js'
import { matchStage } from '../lib/stage.js'
import { FabricPreconditionError } from '../lib/errors.js'
import { dim, safe } from '../lib/output.js'

export const NEXT_EXIT_TIMEOUT = 2
export const NEXT_EXIT_AUTH = 3

export const FabricChangesNextInput = z.object({
  apiUrl: z.string().optional(),
  projectId: z.string().optional(),
  stage: z.string().optional(),
  route: z.string().optional(),
  claim: z.boolean().optional(),
  claimedBy: z.string().optional(),
  title: z.string().optional(),
  leaseMinutes: z.number().optional(),
  interval: z.number().min(5).optional(),
  timeout: z.number().min(0).optional(),
  once: z.boolean().optional(),
})

export const FabricChangesNextOutput = z.object({
  outcome: z.enum(['ready', 'timeout']),
  changes: z.any(),
  answered: z.any(),
  groups: z.any(),
  claimed: z.any(),
})

const clock = {
  now: () => Date.now(),
  sleep: (ms: number) => new Promise<void>((done) => setTimeout(done, ms)),
}

/**
 * Exit codes are the interface: a harness runs this in the background and is
 * woken when it exits. 0 — there is work (printed). 2 — `--timeout` or
 * `--once` found nothing. 3 — the session was refused. 1 — anything else.
 */
export const FabricChangesNext = pikkuSessionlessFunc({
  description:
    'Wait until there is something to work on in the changes queue, then print it.',
  input: FabricChangesNextInput,
  output: FabricChangesNextOutput,
  func: async (_services, input) => {
    if (input.claim && !input.claimedBy)
      throw new FabricPreconditionError(
        '--claim needs --claimed-by, so the panel can say who is holding the batch.'
      )

    const { rpc, projectId: linked } = await changesContext(
      input.apiUrl,
      input.projectId
    )
    const projectId = requireProjectId(linked)
    const stage = input.stage
      ? await matchStage(rpc, projectId, input.stage)
      : null

    const scope = [stage ? `on ${stage.branch}` : null, input.route]
      .filter(Boolean)
      .join(' ')
    const every = input.interval ?? 15
    if (!input.once)
      console.error(
        dim(
          `Waiting for changes${scope ? ` ${scope}` : ''} (checking every ${every}s${input.timeout ? `, up to ${input.timeout}s` : ''})…`
        )
      )

    try {
      const result = await waitForNext(
        rpc,
        {
          projectId,
          stageId: stage?.stageId,
          route: input.route,
          claimedBy: input.claimedBy,
          claim: input.claim ?? false,
          title: input.title,
          leaseMinutes: input.leaseMinutes ?? 30,
          intervalMs: every * 1000,
          timeoutMs: input.timeout ? input.timeout * 1000 : null,
          once: input.once ?? false,
        },
        clock,
        (line) => console.error(dim(line))
      )
      if (result.outcome === 'timeout') process.exitCode = NEXT_EXIT_TIMEOUT
      return result
    } catch (error) {
      if (!(error instanceof FabricAuthError)) throw error
      console.error(error.message)
      throw new CLIError(error.message, NEXT_EXIT_AUTH)
    }
  },
})

type Item = NextResult['changes'][number]

const item = (change: Item): void => {
  const where = change.route ? `  ${dim(safe(change.route))}` : ''
  console.log(`  #${safe(change.shortId)}  ${safe(change.title)}${where}`)
  console.log(dim(`      ${safe(change.changeId)}`))
}

export const renderChangesNext = (_s: unknown, result: NextResult): void => {
  if (result.outcome === 'timeout') {
    console.log(dim('Nothing to pick up.'))
    return
  }
  if (result.claimed) {
    console.log(
      `Claimed ${result.claimed.changes.length} item(s) as “${safe(result.claimed.group.title)}”  ${dim(safe(result.claimed.group.groupId))}`
    )
    result.claimed.changes.forEach(item)
  } else if (result.changes.length) {
    console.log(`Ready to claim (${result.changes.length})`)
    result.changes.forEach(item)
  }
  if (result.answered.length) {
    console.log(
      `Answered (${result.answered.length}) — read the reply with show`
    )
    result.answered.forEach(item)
  }
}
