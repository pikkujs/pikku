import type { PikkuRPC } from '../sdk/pikku-rpc.gen.js'
import type {
  ClaimChangesOutput,
  ListChangesOutput,
} from '../sdk/rpc-map.gen.d.js'
import { FabricPreconditionError } from './errors.js'
import { httpStatus } from './changes.js'
import type { ChangeEvents } from './changes-events.js'

type Change = ListChangesOutput['changes'][number]
type Group = ListChangesOutput['groups'][number]
type ClaimedChange = ClaimChangesOutput['changes'][number]

export interface NextOptions {
  projectId: string
  stageId?: string
  route?: string
  /** Also wake for answers to questions this claimant asked. */
  claimedBy?: string
  claim: boolean
  title?: string
  leaseMinutes: number
  intervalMs: number
  timeoutMs: number | null
  once: boolean
}

export interface Clock {
  now: () => number
  /** Resolves after `ms`, or as soon as `signal` aborts. */
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>
}

export interface NextResult {
  outcome: 'ready' | 'timeout'
  changes: (Change | ClaimedChange)[]
  answered: Change[]
  groups: Group[]
  claimed: ClaimChangesOutput | null
}

export class FabricAuthError extends FabricPreconditionError {}

export const MAX_CONSECUTIVE_FAILURES = 8
const MAX_BACKOFF_MS = 60_000
/** How often to re-read the list anyway while events are arriving. */
export const SAFETY_POLL_MS = 3 * 60_000
/** Past `heldUntil`, so the next read finds the item claimable rather than just short. */
export const HELD_MARGIN_MS = 1_000

const liveLease = (group: Group | undefined, now: number): boolean =>
  !!group?.claimedBy &&
  !!group.claimExpiresAt &&
  new Date(group.claimExpiresAt).getTime() > now

/**
 * What `claimChanges` would accept right now: open or claimed, out of the
 * grace window, and not inside somebody's live lease — including our own,
 * since an item we are holding and chose to leave is not new work.
 */
export function claimable(
  { changes, groups }: ListChangesOutput,
  now: number
): Change[] {
  const byId = new Map(groups.map((group) => [group.groupId, group]))
  return changes.filter(
    (change) =>
      !change.held &&
      (change.status === 'open' || change.status === 'claimed') &&
      !liveLease(change.groupId ? byId.get(change.groupId) : undefined, now)
  )
}

/** Items back from `needs_answer` in a group this claimant holds. */
export function awaitingReview(
  { changes, groups }: ListChangesOutput,
  claimedBy: string | undefined
): Change[] {
  if (!claimedBy) return []
  const mine = new Set(
    groups
      .filter((group) => group.claimedBy === claimedBy)
      .map((group) => group.groupId)
  )
  return changes.filter(
    (change) =>
      change.status === 'in_progress' &&
      !!change.groupId &&
      mine.has(change.groupId)
  )
}

/**
 * The soonest moment an item that is still waiting — in its hold window, or
 * inside another group's lease — becomes claimable. A server that predates
 * `heldUntil` leaves it undefined, and this answers null.
 */
export function soonestClaimable(
  { changes }: ListChangesOutput,
  now: number
): number | null {
  let soonest: number | null = null
  for (const change of changes) {
    if (change.status !== 'open' && change.status !== 'claimed') continue
    if (!change.heldUntil) continue
    const at = new Date(change.heldUntil).getTime()
    if (at > now && (soonest === null || at < soonest)) soonest = at
  }
  return soonest
}

/**
 * An answer is waiting when the person spoke last. Once the agent replies or
 * closes the item it stops counting, so an item left alone after reading the
 * answer cannot wake `next` forever.
 */
async function answered(
  rpc: PikkuRPC,
  candidates: Change[]
): Promise<Change[]> {
  const ready: Change[] = []
  for (const change of candidates) {
    const { thread } = await rpc.invoke('getChange', {
      changeId: change.changeId,
    })
    if (thread.at(-1)?.authorKind === 'user') ready.push(change)
  }
  return ready
}

const isTransient = (error: unknown): boolean => {
  const status = httpStatus(error)
  return (
    status === undefined || status === 408 || status === 429 || status >= 500
  )
}

const explain = (error: unknown): string => {
  const status = httpStatus(error)
  const message = error instanceof Error ? error.message : String(error)
  return status ? `${status} ${message}` : message
}

export const backoffMs = (failures: number, intervalMs: number): number =>
  Math.min(MAX_BACKOFF_MS, intervalMs * 2 ** (failures - 1))

/**
 * Block until there is something to do, then hand it back — optionally already
 * claimed. Each pass is one `listChanges`, narrowed server-side to the statuses
 * that can become work, and the list is the only truth.
 *
 * Between passes it sleeps until the first of: a change event (when `events`
 * is connected), the moment the soonest held item becomes claimable, or the
 * poll interval — `intervalMs` while there is no event stream, the slow
 * `SAFETY_POLL_MS` while there is one.
 */
export async function waitForNext(
  rpc: PikkuRPC,
  options: NextOptions,
  clock: Clock,
  log: (line: string) => void = () => {},
  events: ChangeEvents | null = null
): Promise<NextResult> {
  const deadline =
    options.timeoutMs === null ? null : clock.now() + options.timeoutMs
  let failures = 0

  for (;;) {
    let wait = events?.live
      ? Math.max(options.intervalMs, SAFETY_POLL_MS)
      : options.intervalMs
    try {
      const list = await rpc.invoke('listChanges', {
        projectId: options.projectId,
        stageId: options.stageId,
        route: options.route,
        status: options.claimedBy
          ? ['open', 'claimed', 'in_progress']
          : ['open', 'claimed'],
        pickupOnly: false,
        includeDone: false,
        limit: 200,
      })
      failures = 0

      const soonest = soonestClaimable(list, clock.now())
      if (soonest !== null)
        wait = Math.min(wait, soonest - clock.now() + HELD_MARGIN_MS)

      const changes = claimable(list, clock.now())
      const answers = await answered(
        rpc,
        awaitingReview(list, options.claimedBy)
      )

      if (changes.length || answers.length) {
        const ready = {
          outcome: 'ready' as const,
          changes,
          answered: answers,
          groups: list.groups,
          claimed: null,
        }
        if (!options.claim || !changes.length) return ready
        try {
          const claimed = await rpc.invoke('claimChanges', {
            projectId: options.projectId,
            changeIds: changes.slice(0, 50).map((change) => change.changeId),
            title: options.title ?? defaultTitle(changes),
            claimedBy: options.claimedBy ?? 'pikku-cli',
            leaseMinutes: options.leaseMinutes,
          })
          return { ...ready, changes: claimed.changes, claimed }
        } catch (error) {
          if (httpStatus(error) !== 409) throw error
          if (answers.length) return ready
          log('Someone claimed that batch first; still waiting.')
        }
      }
    } catch (error) {
      const status = httpStatus(error)
      if (status === 401 || status === 403)
        throw new FabricAuthError(
          `fabric refused the session (${explain(error)}). Run \`pikku fabric login\`, then run next again.`
        )
      if (!isTransient(error)) throw error
      failures++
      if (failures >= MAX_CONSECUTIVE_FAILURES)
        throw new FabricPreconditionError(
          `Gave up after ${failures} failed attempts to reach fabric: ${explain(error)}`
        )
      wait = backoffMs(failures, options.intervalMs)
      log(
        `fabric unreachable (${explain(error)}); retrying in ${Math.round(wait / 1000)}s`
      )
    }

    if (options.once) return timedOut()
    if (deadline !== null) {
      const left = deadline - clock.now()
      if (left <= 0) return timedOut()
      wait = Math.min(wait, left)
    }
    const done = new AbortController()
    await Promise.race([
      clock.sleep(wait, done.signal),
      ...(events ? [events.next()] : []),
    ])
    done.abort()
  }
}

const timedOut = (): NextResult => ({
  outcome: 'timeout',
  changes: [],
  answered: [],
  groups: [],
  claimed: null,
})

const defaultTitle = (changes: Change[]): string => {
  const routes = [
    ...new Set(changes.map((change) => change.route).filter(Boolean)),
  ]
  return routes.length === 1 ? `Changes on ${routes[0]}` : 'Changes batch'
}
