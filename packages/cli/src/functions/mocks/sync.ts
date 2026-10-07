import { buildLock, driftOf, serializeLock, type MocksLock } from './lock.js'
import {
  diffMocks,
  functionContract,
  mockContract,
  type SurfaceView,
} from './diff.js'
import type { RpcMocks } from './read.js'

export interface SyncRefusal {
  rpc: string
  problems: string[]
}

export interface SyncPlan {
  ok: boolean
  refused: SyncRefusal[]
  lock: MocksLock
  text: string
  added: string[]
  updated: { rpc: string; changes: number }[]
  removed: string[]
  unchanged: number
}

/** What `pikku mocks sync` would write, and what it would change against the lock already on disk. */
export const planSync = (
  rpcMocks: RpcMocks[],
  surface: SurfaceView,
  existing: MocksLock | null
): SyncPlan => {
  const diff = diffMocks(rpcMocks, surface)
  const refused = diff.rpcs
    .filter(
      (report) => report.status === 'invalid' || report.invalid.length > 0
    )
    .map((report) => ({
      rpc: report.rpc,
      problems: [
        ...report.problems,
        ...report.invalid.flatMap(({ mock, errors }) =>
          errors.map((error) => `${mock}: ${error}`)
        ),
      ],
    }))
  const lock = buildLock(
    rpcMocks.map(({ rpc, mocks }) => ({
      rpc,
      mock: mockContract(mocks),
      function: functionContract(surface, rpc),
    }))
  )
  const added: string[] = []
  const updated: SyncPlan['updated'] = []
  let unchanged = 0
  for (const [rpc, entry] of Object.entries(lock.rpcs)) {
    const before = existing?.rpcs[rpc]
    if (!before) {
      added.push(rpc)
      continue
    }
    const changes =
      driftOf(before.mock, entry.mock).length +
      (before.function || entry.function
        ? driftOf(before.function ?? {}, entry.function ?? {}).length
        : 0)
    if (changes) updated.push({ rpc, changes })
    else unchanged++
  }
  const removed = Object.keys(existing?.rpcs ?? {})
    .filter((rpc) => !lock.rpcs[rpc])
    .sort()
  return {
    ok: refused.length === 0,
    refused,
    lock,
    text: serializeLock(lock),
    added,
    updated,
    removed,
    unchanged,
  }
}
