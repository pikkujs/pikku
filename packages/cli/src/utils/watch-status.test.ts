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
  findChangesSince,
  isMessageFile,
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

  test('compiled and generated frontend files count, as tsc reads them', () => {
    for (const path of [
      '/home/me/.studio/app/apps/web/src/paraglide/messages/_index.js',
      '/home/me/.studio/app/apps/web/src/routeTree.gen.ts',
      '/home/me/.studio/app/apps/web/build/plugin.ts',
    ]) {
      assert.equal(classifyChange(path, dirs), 'typecheck', path)
    }
  })

  test('a message file is its own kind of change', () => {
    assert.equal(
      classifyChange('/home/me/.studio/app/apps/web/messages/en.json', dirs),
      'messages'
    )
  })

  test('editing tsr.config.json is a routes change, whatever else counts', () => {
    assert.equal(
      classifyChange('/home/me/.studio/app/apps/web/tsr.config.json', dirs),
      'routes'
    )
    assert.equal(
      classifyChange('/home/me/.studio/app/apps/other/tsr.config.json', dirs),
      'typecheck'
    )
  })

  test('a message file inside a codegen directory is still a message file', () => {
    const overlapping = { codegenDirs: ['/p'], typecheckDirs: ['/p/apps/web'] }
    assert.equal(
      classifyChange('/p/apps/web/messages/en.json', overlapping),
      'codegen'
    )
    assert.equal(
      isMessageFile('/p/apps/web/messages/en.json', overlapping),
      true
    )
    assert.equal(isMessageFile('/p/src/messages/en.json', overlapping), false)
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

describe('route paths outside the watched roots', () => {
  test('are scanned, the directory and the tree file alike', () => {
    const root = scratch()
    mkdirSync(join(root, 'app'))
    mkdirSync(join(root, 'shared', 'routes'), { recursive: true })
    const route = join(root, 'shared', 'routes', 'a.tsx')
    const tree = join(root, 'shared', 'routeTree.gen.ts')
    writeFileSync(route, '')
    writeFileSync(tree, '')
    utimesSync(route, 100, 100)
    utimesSync(tree, 100, 100)
    const watched = {
      codegenDirs: [],
      typecheckDirs: [join(root, 'app')],
      routePaths: [join(root, 'shared', 'routes'), tree],
    }
    assert.deepEqual(findChangesSince(watched, 200_000), [])
    assert.deepEqual(
      findChangesSince(watched, 50_000)
        .map(({ path }) => path)
        .sort(),
      [route, tree].sort()
    )
  })

  test('are reported once when they also lie under a root', () => {
    const root = scratch()
    mkdirSync(join(root, 'src', 'routes'), { recursive: true })
    const route = join(root, 'src', 'routes', 'a.tsx')
    writeFileSync(route, '')
    utimesSync(route, 100, 100)
    const watched = {
      codegenDirs: [],
      typecheckDirs: [root],
      routePaths: [join(root, 'src', 'routes')],
    }
    assert.deepEqual(
      findChangesSince(watched, 50_000).map(({ path }) => path),
      [route]
    )
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

  test('a watcher that skips the security lint cannot answer a security check', async () => {
    const file = join(scratch(), 'status.json')
    writeWatchStatus(file, status())
    assert.deepEqual(await wait(file, { security: true }), { kind: 'none' })
    writeWatchStatus(file, status({ security: true }))
    assert.equal((await wait(file, { security: true })).kind, 'settled')
    assert.equal((await wait(file)).kind, 'settled')
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

  test('a queue that keeps restarting blames the writer, not the watcher', async () => {
    const file = join(scratch(), 'status.json')
    writeWatchStatus(
      file,
      status({ state: 'running', stage: 'queued', stageStartedAt: 14_000 })
    )
    const result = await wait(file)
    assert.equal(result.kind === 'stuck' && result.stage, 'queued')
    assert.match(
      result.kind === 'stuck' ? result.message : '',
      /Files kept changing/
    )
  })
})

test('the routes and their tree are their own kind of change', () => {
  const dirs = {
    codegenDirs: [],
    typecheckDirs: ['/p/apps/web'],
    routePaths: ['/p/apps/web/src/routes', '/p/apps/web/src/routeTree.gen.ts'],
  }
  assert.equal(classifyChange('/p/apps/web/src/routes/a.tsx', dirs), 'routes')
  assert.equal(
    classifyChange('/p/apps/web/src/routeTree.gen.ts', dirs),
    'routes'
  )
  assert.equal(classifyChange('/p/apps/web/src/a.tsx', dirs), 'typecheck')
})

const idle = {
  version: 1,
  pid: 4242,
  generation: 1,
  updatedAt: 1,
  stageStartedAt: 1,
  sourcesAt: 1,
  codegenDirs: [],
  typecheckDirs: [],
  state: 'ok',
  stage: null,
  diagnostics: [],
} as const

const fileWith = (status: object) => {
  const file = join(mkdtempSync(join(tmpdir(), 'pikku-wake-')), 'status.json')
  writeFileSync(file, JSON.stringify(status))
  return file
}

test('an idle watcher behind its files is woken once per result', async () => {
  const file = fileWith({ ...idle, wakes: true })
  const woken: number[] = []
  let polls = 0
  const result = await waitForWatcher({
    statusFile: file,
    timeoutMs: 1000,
    isAlive: () => true,
    sleep: async () => {},
    wake: (pid) => woken.push(pid),
    changeSince: () => (polls++ < 3 ? '/p/a.ts' : null),
  })
  assert.equal(result.kind, 'settled')
  assert.deepEqual(woken, [4242])
})

test('a watcher that cannot take the signal is not sent it', async () => {
  let time = 0
  const woken: number[] = []
  const result = await waitForWatcher({
    statusFile: fileWith(idle),
    timeoutMs: 10,
    now: () => (time += 5),
    isAlive: () => true,
    sleep: async () => {},
    wake: (pid) => woken.push(pid),
    changeSince: () => '/p/a.ts',
  })
  assert.equal(result.kind, 'stuck')
  assert.deepEqual(woken, [])
})
