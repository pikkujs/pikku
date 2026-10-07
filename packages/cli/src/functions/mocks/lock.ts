import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Contract, Field, Kind } from './contract.js'
import { MOCKS_DIR } from './read.js'

export const LOCK_FILE = 'mocks.lock.json'
export const LOCK_VERSION = 1

export interface LockEntry {
  mock: Contract
  function?: Contract
}

export interface MocksLock {
  version: number
  rpcs: Record<string, LockEntry>
}

export interface Drift {
  path: string
  kind: 'added' | 'removed' | 'retyped' | 'optional'
  was?: string
  now?: string
}

export const lockPath = (rootDir: string): string =>
  join(rootDir, MOCKS_DIR, LOCK_FILE)

const normalizeField = (field: Field): Field => ({
  kinds: [...field.kinds].sort() as Kind[],
  optional: field.optional,
  ...(field.open ? { open: true } : {}),
})

export const normalizeContract = (contract: Contract): Contract =>
  Object.fromEntries(
    Object.keys(contract)
      .sort()
      .map((path) => [path, normalizeField(contract[path]!)])
  )

export const buildLock = (
  entries: { rpc: string; mock: Contract; function?: Contract }[]
): MocksLock => ({
  version: LOCK_VERSION,
  rpcs: Object.fromEntries(
    [...entries]
      .sort((a, b) => (a.rpc < b.rpc ? -1 : a.rpc > b.rpc ? 1 : 0))
      .map(({ rpc, mock, function: fn }) => [
        rpc,
        {
          mock: normalizeContract(mock),
          ...(fn ? { function: normalizeContract(fn) } : {}),
        },
      ])
  ),
})

export const serializeLock = (lock: MocksLock): string =>
  `${JSON.stringify(lock, null, 2)}\n`

/** null when there is no lock file; throws when there is one that cannot be read. */
export const readLock = async (rootDir: string): Promise<MocksLock | null> => {
  const path = lockPath(rootDir)
  if (!existsSync(path)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new Error(
      `${MOCKS_DIR}/${LOCK_FILE} is not valid JSON, run pikku mocks sync to rewrite it: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  const lock = parsed as Partial<MocksLock>
  if (
    !lock ||
    typeof lock !== 'object' ||
    lock.version !== LOCK_VERSION ||
    !lock.rpcs ||
    typeof lock.rpcs !== 'object'
  ) {
    throw new Error(
      `${MOCKS_DIR}/${LOCK_FILE} is not a version ${LOCK_VERSION} lock, run pikku mocks sync to rewrite it`
    )
  }
  return lock as MocksLock
}

const kinds = (field: Field): string => field.kinds.join(' | ')

/** Where a contract differs from the one recorded in the lock. */
export const driftOf = (locked: Contract, current: Contract): Drift[] => {
  const drift: Drift[] = []
  for (const path of Object.keys(current).sort()) {
    const was = locked[path]
    const now = current[path]!
    if (!was) {
      drift.push({ path, kind: 'added', now: kinds(now) })
    } else if (kinds(was) !== kinds(now)) {
      drift.push({ path, kind: 'retyped', was: kinds(was), now: kinds(now) })
    } else if (was.optional !== now.optional) {
      drift.push({
        path,
        kind: 'optional',
        was: was.optional ? 'optional' : 'required',
        now: now.optional ? 'optional' : 'required',
      })
    }
  }
  for (const path of Object.keys(locked).sort()) {
    if (!current[path]) {
      drift.push({ path, kind: 'removed', was: kinds(locked[path]!) })
    }
  }
  return drift
}
