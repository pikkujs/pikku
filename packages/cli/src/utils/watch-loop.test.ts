import assert from 'node:assert'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { setTimeout as sleep } from 'node:timers/promises'
import {
  compileMessages,
  createWatchLoop,
  type CodegenPass,
} from './watch-loop.js'
import { readWatchStatus } from './watch-status.js'
import type { TypecheckResult } from './tsc-check.js'

const dirs = {
  codegenDirs: ['/p/src'],
  typecheckDirs: ['/p/apps/web'],
  routePaths: ['/p/apps/web/src/routes', '/p/apps/web/src/routeTree.gen.ts'],
}
const clean: TypecheckResult = { diagnostics: [], durationMs: 1 }
const passed: CodegenPass = { ok: true, diagnostics: [] }
const statusFile = () =>
  join(mkdtempSync(join(tmpdir(), 'pikku-loop-')), 'status.json')

const waitFor = async (condition: () => boolean) => {
  for (let i = 0; i < 200 && !condition(); i++) await sleep(5)
  assert.ok(condition())
}

const loopWith = (
  overrides: Partial<Parameters<typeof createWatchLoop>[0]>
) => {
  const calls: string[] = []
  const file = statusFile()
  const loop = createWatchLoop({
    statusFile: file,
    dirs,
    debounceMs: 1,
    codegen: async () => {
      calls.push('codegen')
      return passed
    },
    routes: async () => {
      calls.push('routes')
      return []
    },
    messages: async () => {
      calls.push('messages')
      return []
    },
    typecheck: async () => {
      calls.push('typecheck')
      return clean
    },
    onError: (message) => assert.fail(message),
    ...overrides,
  })
  return { loop, calls, file }
}

describe('the watch loop', () => {
  test('a file written behind a run, with no event, gets a run of its own', async () => {
    let writes = 1
    const { loop, calls, file } = loopWith({
      debounceMs: 0,
      changesSince: () =>
        writes-- > 0
          ? [{ path: '/p/apps/web/src/routeTree.gen.ts', mtimeMs: Date.now() }]
          : [],
    })
    await loop.start({ codegen: false })
    assert.deepEqual(calls, [
      'messages',
      'routes',
      'typecheck',
      'routes',
      'typecheck',
    ])
    assert.equal(readWatchStatus(file)?.state, 'ok')
    assert.equal(readWatchStatus(file)?.stage, null)
  })

  test('something that never stops writing still gets a result', async () => {
    let at = Date.now()
    const { loop, calls, file } = loopWith({
      debounceMs: 0,
      changesSince: () => [
        { path: '/p/apps/web/src/a.tsx', mtimeMs: (at += 1) },
      ],
    })
    await loop.start({ codegen: false })
    assert.equal(calls.filter((c) => c === 'typecheck').length, 6)
    assert.equal(readWatchStatus(file)?.state, 'ok')
    assert.equal(readWatchStatus(file)?.stage, null)
  })

  test('a file dated in the future does not hold the result behind it', async () => {
    const future = Date.now() + 3_600_000
    const { loop, calls, file } = loopWith({
      debounceMs: 0,
      changesSince: () => [{ path: '/p/apps/web/src/a.tsx', mtimeMs: future }],
    })
    await loop.start({ codegen: false })
    assert.equal(calls.filter((c) => c === 'typecheck').length, 2)
    assert.equal(readWatchStatus(file)?.sourcesAt, future)
  })

  test('wake runs an idle loop that is behind, and only then', async () => {
    let changes: { path: string; mtimeMs: number }[] = []
    const { loop, calls, file } = loopWith({
      debounceMs: 0,
      changesSince: () => changes,
    })
    await loop.start({ codegen: false })
    assert.equal(readWatchStatus(file)?.wakes, true)
    calls.length = 0
    loop.wake()
    assert.deepEqual(calls, [])
    const path = '/p/apps/web/src/routes/a.tsx'
    changes = [{ path, mtimeMs: Date.now() + 1 }]
    loop.wake()
    assert.equal(readWatchStatus(file)?.state, 'running')
    changes = []
    await waitFor(() => readWatchStatus(file)?.state === 'ok')
    assert.deepEqual(calls, ['routes', 'typecheck'])
  })

  test('a change under the routes regenerates them before the type check', async () => {
    const { loop, calls } = loopWith({})
    await loop.start({ codegen: false })
    calls.length = 0
    loop.onChange('/p/apps/web/src/routes/app.tests.tsx')
    await waitFor(() => calls.includes('typecheck'))
    assert.deepEqual(calls, ['routes', 'typecheck'])
  })

  test('another frontend file does not', async () => {
    const { loop, calls } = loopWith({})
    await loop.start({ codegen: false })
    calls.length = 0
    loop.onChange('/p/apps/web/src/pages/a.tsx')
    await waitFor(() => calls.includes('typecheck'))
    assert.deepEqual(calls, ['typecheck'])
  })

  test('a failed generator fails the run and is retried', async () => {
    let fail = true
    const { loop, file } = loopWith({
      routes: async () =>
        fail
          ? [{ severity: 'error', code: 'ROUTES', message: 'bad route' }]
          : [],
    })
    await loop.start({ codegen: false })
    assert.equal(readWatchStatus(file)?.state, 'failed')
    assert.equal(readWatchStatus(file)?.diagnostics[0]?.code, 'ROUTES')
    fail = false
    loop.onChange('/p/apps/web/src/pages/a.tsx')
    await waitFor(() => readWatchStatus(file)?.state === 'ok')
  })

  test('publishes ok after codegen and type check', async () => {
    const { loop, calls, file } = loopWith({})
    await loop.start({ codegen: true })
    assert.deepEqual(calls, ['codegen', 'messages', 'routes', 'typecheck'])
    const status = readWatchStatus(file)
    assert.equal(status?.state, 'ok')
    assert.equal(status?.pid, process.pid)
    assert.equal(status?.typecheck?.durationMs, 1)
  })

  test('shows running, with the stage, while it works', async () => {
    let seen: string | null | undefined
    const { loop, file } = loopWith({
      typecheck: async () => {
        seen = readWatchStatus(file)?.stage
        return clean
      },
    })
    await loop.start({ codegen: false })
    assert.equal(seen, 'typecheck')
  })

  test('a type error fails the run and keeps its position', async () => {
    const { loop, file } = loopWith({
      typecheck: async () => ({
        ...clean,
        diagnostics: [
          {
            severity: 'error',
            code: 'TS2322',
            message: 'nope',
            file: 'src/a.ts',
            line: 3,
            column: 7,
          },
        ],
      }),
    })
    await loop.start({ codegen: false })
    const status = readWatchStatus(file)
    assert.equal(status?.state, 'failed')
    assert.equal(status?.diagnostics[0]?.line, 3)
  })

  test('a warning alone does not fail the run', async () => {
    const { loop, file } = loopWith({
      codegen: async () => ({
        ok: true,
        diagnostics: [{ severity: 'warn', code: 'PKU1', message: 'hm' }],
      }),
    })
    await loop.start({ codegen: true })
    assert.equal(readWatchStatus(file)?.state, 'ok')
  })

  test('a checker that dies is a failure, not a silent pass', async () => {
    const { loop, file } = loopWith({
      typecheck: async () => {
        throw new Error('the type checker stopped (SIGKILL)')
      },
    })
    await loop.start({ codegen: false })
    const status = readWatchStatus(file)
    assert.equal(status?.state, 'failed')
    assert.match(status?.diagnostics[0]?.message ?? '', /SIGKILL/)
  })

  test('a frontend edit type-checks without running codegen', async () => {
    const { loop, calls } = loopWith({})
    await loop.start({ codegen: false })
    calls.length = 0
    loop.onChange('/p/apps/web/a.tsx')
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.deepEqual(calls, ['typecheck'])
  })

  test('failed codegen runs again on a frontend edit', async () => {
    let attempts = 0
    const { loop, file } = loopWith({
      codegen: async () =>
        ++attempts === 1
          ? {
              ok: false,
              diagnostics: [{ severity: 'critical', code: 'X', message: 'x' }],
            }
          : passed,
    })
    await loop.start({ codegen: true })
    assert.equal(readWatchStatus(file)?.state, 'failed')
    loop.onChange('/p/apps/web/a.tsx')
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(attempts, 2)
    assert.equal(readWatchStatus(file)?.state, 'ok')
  })

  test('a change mid-run discards that result, so the latest state wins', async () => {
    let checks = 0
    const results: string[] = []
    const { loop, file } = loopWith({
      typecheck: async () => {
        checks++
        if (checks === 1) loop.onChange('/p/src/a.ts')
        results.push(readWatchStatus(file)?.state ?? 'none')
        return checks === 1
          ? {
              ...clean,
              diagnostics: [
                { severity: 'error', code: 'TS1', message: 'old state' },
              ],
            }
          : clean
      },
    })
    await loop.start({ codegen: false })
    assert.equal(checks, 2)
    assert.deepEqual(results, ['running', 'running'])
    assert.equal(readWatchStatus(file)?.state, 'ok')
    assert.equal(readWatchStatus(file)?.generation, 2)
  })

  test('a change mid-check aborts the check in flight', async () => {
    let checks = 0
    const aborted: boolean[] = []
    const { loop, file } = loopWith({
      typecheck: (signal) => {
        checks++
        if (checks > 1) return Promise.resolve(clean)
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            aborted.push(signal.aborted)
            reject(new Error('superseded'))
          })
          loop.onChange('/p/src/a.ts')
        })
      },
    })
    await loop.start({ codegen: false })
    assert.deepEqual(aborted, [true])
    assert.equal(checks, 2)
    assert.equal(readWatchStatus(file)?.state, 'ok')
    assert.deepEqual(readWatchStatus(file)?.diagnostics, [])
  })

  test('a message edit compiles before the type check, and the status clears', async () => {
    let compiled = false
    const { loop, calls, file } = loopWith({
      messages: async () => {
        calls.push('messages')
        compiled = true
        return []
      },
      typecheck: async () => {
        calls.push('typecheck')
        return compiled
          ? clean
          : {
              ...clean,
              diagnostics: [
                { severity: 'error', code: 'TS2339', message: 'no such key' },
              ],
            }
      },
    })
    loop.onChange('/p/apps/web/messages/en.json')
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.deepEqual(calls, ['messages', 'typecheck'])
    assert.equal(readWatchStatus(file)?.state, 'ok')
  })

  test('a compile that fails fails the run and is tried again', async () => {
    let attempts = 0
    const { loop, file } = loopWith({
      messages: async () =>
        ++attempts === 1
          ? [{ severity: 'error', code: 'MESSAGES', message: 'bad json' }]
          : [],
    })
    await loop.start({ codegen: false })
    assert.equal(readWatchStatus(file)?.state, 'failed')
    loop.onChange('/p/apps/web/a.tsx')
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(attempts, 2)
    assert.equal(readWatchStatus(file)?.state, 'ok')
  })

  test('a run dropped during codegen still compiles messages and routes', async () => {
    const { loop, calls } = loopWith({
      codegen: async () => {
        calls.push('codegen')
        if (calls.length === 1) loop.onChange('/p/apps/web/src/pages/a.tsx')
        return passed
      },
    })
    await loop.start({ codegen: true })
    assert.deepEqual(calls, ['codegen', 'messages', 'routes', 'typecheck'])
  })

  test('an edit already taken by a run does not start another', async () => {
    let checks = 0
    const { loop } = loopWith({
      debounceMs: 40,
      typecheck: async () => {
        if (++checks === 1) loop.onChange('/p/src/a.ts')
        return clean
      },
    })
    await loop.start({ codegen: false })
    await sleep(120)
    assert.equal(checks, 2)
  })

  test('a stage that throws fails the run and is retried, not unhandled', async () => {
    let fail = true
    const { loop, file } = loopWith({
      routes: async () => {
        if (fail) throw new Error('routesDirectory is not a string')
        return []
      },
    })
    await loop.start({ codegen: false })
    const failed = readWatchStatus(file)
    assert.equal(failed?.state, 'failed')
    assert.equal(failed?.diagnostics[0]?.code, 'ROUTES')
    assert.match(failed?.diagnostics[0]?.message ?? '', /routesDirectory/)
    fail = false
    loop.onChange('/p/apps/web/src/pages/a.tsx')
    await waitFor(() => readWatchStatus(file)?.state === 'ok')
  })

  test('a messages edit under a codegen directory compiles messages too', async () => {
    const { loop, calls } = loopWith({
      dirs: { ...dirs, codegenDirs: ['/p'] },
    })
    await loop.start({ codegen: false })
    calls.length = 0
    loop.onChange('/p/apps/web/messages/en.json')
    await waitFor(() => calls.includes('typecheck'))
    assert.deepEqual(calls, ['codegen', 'messages', 'typecheck'])
  })

  test('what startup codegen reported is not forgotten when nothing changed', async () => {
    const problem = { severity: 'error', code: 'PKU1', message: 'bad wiring' }
    const { loop, calls, file } = loopWith({})
    await loop.start({
      codegen: false,
      startup: { ok: true, diagnostics: [problem as never] },
    })
    assert.equal(calls.includes('codegen'), false)
    assert.equal(readWatchStatus(file)?.state, 'failed')
    assert.equal(readWatchStatus(file)?.diagnostics[0]?.code, 'PKU1')
  })

  test('editing tsr.config.json moves the watched route paths', async () => {
    let paths = dirs.routePaths
    const { loop, calls, file } = loopWith({ routePaths: () => paths })
    await loop.start({ codegen: false })
    paths = ['/p/apps/web/app/routes', '/p/apps/web/app/routeTree.gen.ts']
    calls.length = 0
    loop.onChange('/p/apps/web/tsr.config.json')
    await waitFor(() => calls.includes('typecheck'))
    assert.deepEqual(calls, ['routes', 'typecheck'])
    assert.deepEqual(readWatchStatus(file)?.routePaths, paths)
    calls.length = 0
    loop.onChange('/p/apps/web/app/routes/a.tsx')
    await waitFor(() => calls.includes('typecheck'))
    assert.deepEqual(calls, ['routes', 'typecheck'])
  })

  test('the status says whether codegen ran the security lint', async () => {
    const plain = loopWith({})
    await plain.loop.start({ codegen: false })
    assert.equal(readWatchStatus(plain.file)?.security, undefined)
    const linted = loopWith({ security: true })
    await linted.loop.start({ codegen: false })
    assert.equal(readWatchStatus(linted.file)?.security, true)
  })

  test('ignored files start nothing', async () => {
    const { loop, calls } = loopWith({})
    loop.onChange('/p/apps/web/dist/a.ts')
    loop.onChange('/p/src/x.gen.ts')
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.deepEqual(calls, [])
  })
})

describe('compiling messages', () => {
  const frontend = (scripts: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), 'pikku-messages-'))
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts }))
    return dir
  }

  test("runs the frontend's own script", async () => {
    const dir = frontend({
      paraglide: "node -e \"fs.writeFileSync('out','')\"",
    })
    assert.deepEqual(await compileMessages([dir]), [])
    assert.equal(existsSync(join(dir, 'out')), true)
  })

  test('takes i18n:compile when that is the name', async () => {
    const dir = frontend({
      'i18n:compile': "node -e \"fs.writeFileSync('out','')\"",
    })
    await compileMessages([dir])
    assert.equal(existsSync(join(dir, 'out')), true)
  })

  test('a frontend with neither has nothing to do', async () => {
    assert.deepEqual(await compileMessages([frontend({})]), [])
  })

  test('the timeout is shared by every frontend, not given to each', async () => {
    const slow = {
      paraglide: 'node -e "setTimeout(() => {}, 1500)"',
    }
    const started = Date.now()
    const problems = await compileMessages(
      [frontend(slow), frontend(slow)],
      2000
    )
    assert.equal(problems.length, 1)
    assert.ok(Date.now() - started < 2800)
  })

  test('a failing script is reported with its output', async () => {
    const dir = frontend({
      paraglide: 'node -e "console.error(\'bad key\');process.exit(3)"',
    })
    const [problem] = await compileMessages([dir])
    assert.equal(problem?.code, 'MESSAGES')
    assert.match(problem?.message ?? '', /bad key/)
  })
})
