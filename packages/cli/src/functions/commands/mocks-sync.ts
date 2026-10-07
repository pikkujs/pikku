import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { pikkuSessionlessFunc } from '#pikku/function'
import { added, changed, dim, removed } from '../../fabric/lib/output.js'
import { loadSurface } from '../mocks/load.js'
import { LOCK_FILE, lockPath, readLock } from '../mocks/lock.js'
import { MOCKS_DIR, readMocks } from '../mocks/read.js'
import { planSync, type SyncRefusal } from '../mocks/sync.js'

export interface MocksSyncResult {
  ok: boolean
  path: string
  written: boolean
  refused: SyncRefusal[]
  added: string[]
  updated: { rpc: string; changes: number }[]
  removed: string[]
  unchanged: number
}

export const mocksSync = pikkuSessionlessFunc<
  Record<string, never>,
  MocksSyncResult
>({
  description:
    'Record the shape of every mock, and of the function behind it, in .mocks/mocks.lock.json so later edits to a mock show up in pikku mocks diff',
  func: async ({ config }) => {
    const path = lockPath(config.rootDir)
    const rpcMocks = await readMocks(config.rootDir)
    const plan = planSync(
      rpcMocks,
      loadSurface(config.rootDir, config.outDir),
      await readLock(config.rootDir)
    )
    const result: MocksSyncResult = {
      ok: plan.ok,
      path,
      written: false,
      refused: plan.refused,
      added: plan.added,
      updated: plan.updated,
      removed: plan.removed,
      unchanged: plan.unchanged,
    }
    if (!plan.ok) return result
    if (!rpcMocks.length && !existsSync(path)) return result
    const current = existsSync(path) ? await readFile(path, 'utf8') : null
    if (current !== plan.text) {
      await writeFile(path, plan.text)
      result.written = true
    }
    return result
  },
})

export const renderMocksSync = (
  _services: unknown,
  result: MocksSyncResult
): void => {
  const file = `${MOCKS_DIR}/${LOCK_FILE}`
  if (!result.ok) {
    console.log(
      `${removed('✗')} ${file} was not written: ${result.refused.length} RPC${result.refused.length === 1 ? ' is' : 's are'} invalid. Fix ${result.refused.length === 1 ? 'it' : 'them'} first (pikku mocks diff shows why).`
    )
    for (const { rpc, problems } of result.refused) {
      console.log(`${removed('invalid')}  ${rpc}`)
      for (const problem of problems)
        console.log(`     ${removed('✗')} ${problem}`)
    }
    process.exitCode = 1
    return
  }
  if (!result.written && !result.added.length && !result.removed.length) {
    console.log(
      dim(
        result.unchanged || result.updated.length
          ? `${file} is up to date`
          : 'No mocks found. Add .mocks/<rpc.name>/<mock>.json'
      )
    )
    return
  }
  for (const rpc of result.added)
    console.log(`${added('+')} ${rpc}  ${dim('added to the lock')}`)
  for (const { rpc, changes } of result.updated) {
    console.log(
      `${changed('~')} ${rpc}  ${dim(`${changes} field${changes === 1 ? '' : 's'} updated in the lock`)}`
    )
  }
  for (const rpc of result.removed)
    console.log(`${removed('-')} ${rpc}  ${dim('dropped from the lock')}`)
  console.log()
  console.log(
    dim(
      `${file} written · ${result.added.length} added · ${result.updated.length} updated · ${result.removed.length} removed · ${result.unchanged} unchanged`
    )
  )
}
