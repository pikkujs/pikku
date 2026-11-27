import type { Redis } from 'ioredis'
import { DRIVEN_RUN_STATUSES } from '@pikku/core/workflow'

/**
 * The sorted set of runs only a driver moves on, scored by when each was last
 * written. The conditional run write keeps it, in the same script as the status.
 */
export const drivenRunsKey = (keyPrefix: string): string =>
  `${keyPrefix}:driven-runs`

const indexedMarkerKey = (keyPrefix: string): string =>
  `${keyPrefix}:driven-runs-indexed`

/**
 * KEYS are the run hash and the index; ARGV the run id and the driven statuses.
 * Adds a run in one of them, and drops any other.
 */
const SYNC_DRIVEN_RUN = `
local current = redis.call('HGET', KEYS[1], 'status')
for i = 2, #ARGV do
  if ARGV[i] == current then
    redis.call('ZADD', KEYS[2], redis.call('HGET', KEYS[1], 'updatedAt'), ARGV[1])
    return 1
  end
end
redis.call('ZREM', KEYS[2], ARGV[1])
return 0
`

const PAGE_OF_INDEX = `
return redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', ARGV[2], ARGV[3])
`

const syncDrivenRun = async (
  redis: Redis,
  keyPrefix: string,
  runId: string
): Promise<boolean> =>
  Number(
    await redis.eval(
      SYNC_DRIVEN_RUN,
      2,
      `${keyPrefix}:run:${runId}`,
      drivenRunsKey(keyPrefix),
      runId,
      ...DRIVEN_RUN_STATUSES
    )
  ) === 1

/**
 * Index the runs stored without one, once per key prefix. Deleting the marker
 * key makes the next call do it again.
 */
const indexStoredRuns = async (
  redis: Redis,
  keyPrefix: string
): Promise<void> => {
  if (await redis.exists(indexedMarkerKey(keyPrefix))) return
  const runKeyStart = `${keyPrefix}:run:`
  let cursor = '0'
  do {
    const [next, keys] = await redis.scan(
      cursor,
      'MATCH',
      `${runKeyStart}*`,
      'COUNT',
      100
    )
    cursor = next
    for (const key of keys) {
      await syncDrivenRun(redis, keyPrefix, key.slice(runKeyStart.length))
    }
  } while (cursor !== '0')
  await redis.set(indexedMarkerKey(keyPrefix), '1')
}

/** A page of the indexed runs last written before `before`, oldest first. */
export const findDrivenRunIds = async (
  redis: Redis,
  keyPrefix: string,
  before: Date,
  limit: number,
  offset: number
): Promise<string[]> => {
  await indexStoredRuns(redis, keyPrefix)
  const found: string[] = []
  while (found.length < limit) {
    const wanted = limit - found.length
    const page = (await redis.eval(
      PAGE_OF_INDEX,
      1,
      drivenRunsKey(keyPrefix),
      `(${before.getTime()}`,
      (offset + found.length).toString(),
      wanted.toString()
    )) as string[]
    let dropped = 0
    for (const runId of page) {
      // An entry whose run is gone, or has moved on, is dropped as it is met.
      if (await syncDrivenRun(redis, keyPrefix, runId)) found.push(runId)
      else dropped++
    }
    if (dropped === 0 && page.length < wanted) break
  }
  return found
}
