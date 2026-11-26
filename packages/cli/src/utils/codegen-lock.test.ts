import assert from 'node:assert'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { setTimeout as sleep } from 'node:timers/promises'
import { withCodegenLock } from './codegen-lock.js'

const logger = { info() {} } as any

const scratch = join(import.meta.dirname, '..', '..', '.tmp', 'codegen-lock')
after(() => rmSync(scratch, { recursive: true, force: true }))

let dirs = 0
const outDir = () => join(scratch, `project-${process.pid}-${dirs++}`, '.pikku')

const lockOf = (dir: string) =>
  join(
    dirname(dir),
    '.tmp',
    `pikku-all-${createHash('sha256').update(dir).digest('hex').slice(0, 16)}.lock`
  )

const holdLock = (dir: string, pid: number | undefined) => {
  mkdirSync(dirname(lockOf(dir)), { recursive: true })
  writeFileSync(lockOf(dir), String(pid))
}

const sleeper = () =>
  spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
    stdio: 'ignore',
  })

test('the lock is gone afterwards, even when the work throws', async () => {
  const dir = outDir()
  await assert.rejects(
    withCodegenLock(logger, dir, async () => {
      assert.equal(existsSync(lockOf(dir)), true)
      throw new Error('boom')
    })
  )
  assert.equal(existsSync(lockOf(dir)), false)
})

test('a nested run in the holder does not wait for itself', async () => {
  const dir = outDir()
  const result = await withCodegenLock(logger, dir, () =>
    withCodegenLock(logger, dir, async () => 'inner')
  )
  assert.equal(result, 'inner')
})

test('a live holder is waited for, a dead one is not', async () => {
  const dir = outDir()
  const holder = sleeper()
  holdLock(dir, holder.pid)
  const order: string[] = []
  const run = withCodegenLock(logger, dir, async () => {
    order.push('ran')
  })
  await sleep(500)
  assert.deepEqual(order, [])
  holder.kill('SIGKILL')
  await run
  assert.deepEqual(order, ['ran'])
})

test('other output directories do not wait', async () => {
  const dir = outDir()
  const holder = sleeper()
  holdLock(dir, holder.pid)
  await withCodegenLock(logger, outDir(), async () => {})
  holder.kill('SIGKILL')
  await withCodegenLock(logger, dir, async () => {})
})
