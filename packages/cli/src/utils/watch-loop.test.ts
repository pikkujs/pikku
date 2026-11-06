import assert from 'node:assert'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import {
  compileMessages,
  createWatchLoop,
  type CodegenPass,
} from './watch-loop.js'
import { readWatchStatus } from './watch-status.js'
import type { TypecheckResult } from './warm-typecheck.js'

const dirs = { codegenDirs: ['/p/src'], typecheckDirs: ['/p/apps/web'] }
const clean: TypecheckResult = { diagnostics: [], durationMs: 1, rssBytes: 1 }
const passed: CodegenPass = { ok: true, diagnostics: [] }
const statusFile = () =>
  join(mkdtempSync(join(tmpdir(), 'pikku-loop-')), 'status.json')

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
  test('publishes ok after codegen and type check', async () => {
    const { loop, calls, file } = loopWith({})
    await loop.start({ codegen: true })
    assert.deepEqual(calls, ['codegen', 'messages', 'typecheck'])
    const status = readWatchStatus(file)
    assert.equal(status?.state, 'ok')
    assert.equal(status?.pid, process.pid)
    assert.equal(status?.typecheck?.rssBytes, 1)
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

  test('a failing script is reported with its output', async () => {
    const dir = frontend({
      paraglide: 'node -e "console.error(\'bad key\');process.exit(3)"',
    })
    const [problem] = await compileMessages([dir])
    assert.equal(problem?.code, 'MESSAGES')
    assert.match(problem?.message ?? '', /bad key/)
  })
})
