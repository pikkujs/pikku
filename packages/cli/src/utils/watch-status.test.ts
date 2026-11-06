import assert from 'node:assert'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import {
  classifyChange,
  findChangeSince,
  isIgnoredByWatcher,
  readWatchStatus,
  waitForWatcher,
  writeWatchStatus,
  type WatchStatus,
} from './watch-status.js'

const scratch = () => mkdtempSync(join(tmpdir(), 'pikku-status-'))

const status = (fields: Partial<WatchStatus> = {}): WatchStatus => ({
  version: 1,
  pid: 4242,
  state: 'ok',
  stage: null,
  generation: 3,
  stageStartedAt: 1000,
  updatedAt: 1000,
  sourcesAt: 1000,
  codegenDirs: [],
  typecheckDirs: [],
  diagnostics: [],
  ...fields,
})

/** A clock that moves only when the waiter sleeps. */
const clock = () => {
  let at = 10_000
  return { now: () => at, sleep: async (ms: number) => void (at += ms) }
}

describe('status file', () => {
  test('is replaced whole and leaves no temporary behind', () => {
    const dir = scratch()
    const file = join(dir, '.pikku', 'status.json')
    writeWatchStatus(file, status({ generation: 7 }))
    assert.equal(readWatchStatus(file)?.generation, 7)
    assert.deepEqual(readdirSync(join(dir, '.pikku')), ['status.json'])
  })

  test('half a file reads as no status', () => {
    const file = join(scratch(), 'status.json')
    writeFileSync(file, '{"version":1,')
    assert.equal(readWatchStatus(file), null)
  })
})

describe('which files count', () => {
  const dirs = {
    codegenDirs: ['/home/me/.studio/app/src'],
    typecheckDirs: ['/home/me/.studio/app/apps/web'],
  }

  test('a dot directory above the watched root does not hide the project', () => {
    assert.equal(
      classifyChange('/home/me/.studio/app/src/a.ts', dirs),
      'codegen'
    )
    assert.equal(
      classifyChange('/home/me/.studio/app/apps/web/b.tsx', dirs),
      'typecheck'
    )
  })

  test('output and generated files never count', () => {
    for (const path of [
      '/home/me/.studio/app/apps/web/dist/x.ts',
      '/home/me/.studio/app/apps/web/node_modules/x/y.ts',
      '/home/me/.studio/app/apps/web/.tanstack/x.ts',
      '/home/me/.studio/app/src/routes.gen.ts',
    ]) {
      assert.equal(isIgnoredByWatcher(path, dirs), true, path)
      assert.equal(classifyChange(path, dirs), null, path)
    }
  })

  test('a frontend file tsc cannot see does not trigger a run', () => {
    assert.equal(
      classifyChange('/home/me/.studio/app/apps/web/logo.png', dirs),
      null
    )
  })

  test('finds a file saved after the given moment, and only that', () => {
    const root = scratch()
    mkdirSync(join(root, 'src'))
    const file = join(root, 'src', 'a.ts')
    writeFileSync(file, '')
    utimesSync(file, 100, 100)
    const watched = { codegenDirs: [join(root, 'src')], typecheckDirs: [] }
    assert.equal(findChangeSince(watched, 200_000), null)
    assert.equal(findChangeSince(watched, 50_000), file)
  })
})

describe('waiting for the watcher', () => {
  const wait = (
    file: string,
    extra: Partial<Parameters<typeof waitForWatcher>[0]> = {}
  ) =>
    waitForWatcher({
      statusFile: file,
      timeoutMs: 5000,
      isAlive: () => true,
      changeSince: () => null,
      ...clock(),
      ...extra,
    })

  test('no status file means no watcher', async () => {
    assert.deepEqual(await wait(join(scratch(), 'status.json')), {
      kind: 'none',
    })
  })

  test('a status left by a dead watcher means no watcher', async () => {
    const file = join(scratch(), 'status.json')
    writeWatchStatus(file, status())
    assert.deepEqual(await wait(file, { isAlive: () => false }), {
      kind: 'none',
    })
  })

  test('a current result returns straight away', async () => {
    const file = join(scratch(), 'status.json')
    writeWatchStatus(file, status({ state: 'failed' }))
    const result = await wait(file)
    assert.equal(result.kind, 'settled')
  })

  test('an ok older than the newest edit is not reported', async () => {
    const file = join(scratch(), 'status.json')
    writeWatchStatus(file, status())
    let polls = 0
    const result = await wait(file, {
      sleep: async () => {
        // The watcher catches up on the third look.
        if (++polls === 3) {
          writeWatchStatus(file, status({ generation: 4, sourcesAt: 9000 }))
        }
      },
      changeSince: (_dirs, since) => (since < 9000 ? '/p/src/a.ts' : null),
      now: (() => {
        let at = 0
        return () => (at += 10)
      })(),
    })
    assert.equal(result.kind, 'settled')
    assert.equal(result.kind === 'settled' && result.status.generation, 4)
    assert.equal(polls, 3)
  })

  test('a stale ok the watcher never picks up fails naming the file', async () => {
    const file = join(scratch(), 'status.json')
    writeWatchStatus(file, status())
    const result = await wait(file, { changeSince: () => '/p/src/a.ts' })
    assert.equal(result.kind, 'stuck')
    assert.equal(result.kind === 'stuck' && result.stage, 'waiting')
    assert.match(
      result.kind === 'stuck' ? result.message : '',
      /\/p\/src\/a\.ts/
    )
  })

  test('a watcher stuck mid-run fails naming the stage', async () => {
    const file = join(scratch(), 'status.json')
    writeWatchStatus(
      file,
      status({ state: 'running', stage: 'typecheck', stageStartedAt: 10_000 })
    )
    const result = await wait(file)
    assert.equal(result.kind, 'stuck')
    assert.equal(result.kind === 'stuck' && result.stage, 'typecheck')
    assert.match(
      result.kind === 'stuck' ? result.message : '',
      /typecheck stage for 5s/
    )
  })
})
