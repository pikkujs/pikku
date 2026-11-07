import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import {
  parseTscOutput,
  renderTscFull,
  renderTscSummary,
  typecheckProjects,
} from './tsc-check.js'

const ROOT = '/project'

/** One `tsc --pretty false` diagnostic line. */
const line = (
  file: string | null,
  ln: number,
  col: number,
  category: string,
  code: number,
  message: string
) =>
  file === null
    ? `${category} TS${code}: ${message}`
    : `${file}(${ln},${col}): ${category} TS${code}: ${message}`

describe('parseTscOutput', () => {
  test('counts errors/warnings and keeps tsc positions verbatim', () => {
    const result = parseTscOutput(
      [
        line(`${ROOT}/src/a.ts`, 5, 3, 'error', 2345, 'bad arg'),
        line(`${ROOT}/src/b.ts`, 1, 1, 'warning', 6133, 'unused'),
        'Found 1 error in 1 file.',
      ].join('\n'),
      ROOT
    )
    assert.equal(result.errorCount, 1)
    assert.equal(result.warningCount, 1)
    assert.equal(result.fileCount, 2)
    const first = result.diagnostics.find((d) => d.code === 2345)!
    assert.equal(first.file, 'src/a.ts')
    assert.equal(first.line, 5)
    assert.equal(first.column, 3)
  })

  test('resolves paths tsc reports relative to the project root', () => {
    const result = parseTscOutput(
      line('src/a.ts', 2, 4, 'error', 2345, 'bad arg'),
      ROOT
    )
    assert.equal(result.diagnostics[0]!.file, 'src/a.ts')
  })

  test('drops node_modules and out-of-root diagnostics', () => {
    const result = parseTscOutput(
      [
        line(`${ROOT}/node_modules/dep/index.d.ts`, 1, 1, 'error', 1, 'x'),
        line('/elsewhere/z.ts', 1, 1, 'error', 2, 'y'),
        line(`${ROOT}/src/keep.ts`, 1, 1, 'error', 3, 'keep'),
      ].join('\n'),
      ROOT
    )
    assert.equal(result.errorCount, 1)
    assert.equal(result.diagnostics.length, 1)
    assert.equal(result.diagnostics[0]!.file, 'src/keep.ts')
  })

  test('folds indented elaborations into the message they belong to', () => {
    const result = parseTscOutput(
      [
        line(`${ROOT}/src/a.ts`, 1, 1, 'error', 2345, 'Argument bad.'),
        "  Type 'string' is not assignable to type 'number'.",
      ].join('\n'),
      ROOT
    )
    assert.equal(result.diagnostics.length, 1)
    assert.equal(
      result.diagnostics[0]!.message,
      "Argument bad. Type 'string' is not assignable to type 'number'."
    )
  })

  test('drops the elaborations of a filtered-out diagnostic too', () => {
    const result = parseTscOutput(
      [
        line(`${ROOT}/node_modules/dep/index.d.ts`, 1, 1, 'error', 1, 'x'),
        '  some elaboration',
      ].join('\n'),
      ROOT
    )
    assert.equal(result.diagnostics.length, 0)
  })

  test('keeps file-less (global) diagnostics under the project label', () => {
    const result = parseTscOutput(
      line(null, 0, 0, 'error', 18003, 'No inputs were found'),
      ROOT
    )
    assert.equal(result.errorCount, 1)
    assert.equal(result.diagnostics[0]!.file, '(project)')
    assert.equal(result.diagnostics[0]!.line, 0)
  })
})

describe('renderTscSummary', () => {
  test('returns a passing line when there are no diagnostics', () => {
    const out = renderTscSummary({
      errorCount: 0,
      warningCount: 0,
      fileCount: 0,
      diagnostics: [],
    })
    assert.match(out, /passed/)
  })

  test('renders a compact header + one line per diagnostic, no code frames', () => {
    const result = parseTscOutput(
      line(`${ROOT}/src/a.ts`, 5, 3, 'error', 2345, 'Argument bad'),
      ROOT
    )
    const out = renderTscSummary(result)
    const lines = out.split('\n')
    assert.equal(lines[0], 'Type check: 1 error in 1 file')
    assert.equal(lines[1], '  src/a.ts:5:3  TS2345  Argument bad')
    assert.equal(lines.length, 2)
  })

  test('caps output and reports the remainder', () => {
    const result = parseTscOutput(
      Array.from({ length: 5 }, (_, i) =>
        line(`${ROOT}/src/f${i}.ts`, i + 1, 1, 'error', 1000 + i, `err ${i}`)
      ).join('\n'),
      ROOT
    )
    const out = renderTscSummary(result, 2)
    const lines = out.split('\n')
    // header + 2 shown + 1 "and N more"
    assert.equal(lines.length, 4)
    assert.match(lines.at(-1)!, /… and 3 more/)
  })
})

describe('renderTscFull', () => {
  test('renders every diagnostic, past the summary cap', () => {
    const result = parseTscOutput(
      Array.from({ length: 5 }, (_, i) =>
        line(`${ROOT}/src/f${i}.ts`, i + 1, 1, 'error', 1000 + i, `err ${i}`)
      ).join('\n'),
      ROOT
    )
    assert.equal(renderTscFull(result).split('\n').length, 5)
  })
})

describe('typecheckProjects', () => {
  /** A project whose `typescript` is the given script. */
  const fakeProject = (name: string, script: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'pikku-tsc-'))
    const compiler = join(dir, 'node_modules', 'typescript')
    mkdirSync(compiler, { recursive: true })
    writeFileSync(
      join(compiler, 'package.json'),
      JSON.stringify({ bin: { tsc: './tsc.cjs' } })
    )
    writeFileSync(join(compiler, 'tsc.cjs'), script)
    writeFileSync(join(dir, 'tsconfig.json'), '{}')
    return { name, dir, tsconfig: join(dir, 'tsconfig.json') }
  }
  const printing = (line: string, code = 2) =>
    `console.log(${JSON.stringify(line)}); process.exitCode = ${code}`
  const alive = (pid: number) => {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  test('runs each project and reports files from the project root', async () => {
    const web = fakeProject(
      'web',
      printing("src/a.ts(3,5): error TS2322: Type 'string' is wrong.")
    )
    const api = fakeProject('api', printing('', 0))
    const { diagnostics } = await typecheckProjects([web, api], tmpdir())
    assert.equal(diagnostics.length, 1)
    assert.deepEqual(
      { ...diagnostics[0], file: diagnostics[0]!.file?.split('/').slice(-2) },
      {
        severity: 'error',
        code: 'TS2322',
        message: "Type 'string' is wrong.",
        project: 'web',
        file: ['src', 'a.ts'],
        line: 3,
        column: 5,
      }
    )
  })

  test('a diagnostic with no place carries no file', async () => {
    const project = fakeProject('web', printing('error TS5083: Cannot read.'))
    const { diagnostics } = await typecheckProjects([project], tmpdir())
    assert.deepEqual(diagnostics, [
      {
        severity: 'error',
        code: 'TS5083',
        message: 'Cannot read.',
        project: 'web',
      },
    ])
  })

  test('runs side by side', async () => {
    const script = `setTimeout(() => {}, 400)`
    const started = Date.now()
    await typecheckProjects(
      [fakeProject('a', script), fakeProject('b', script)],
      tmpdir()
    )
    assert.ok(Date.now() - started < 750)
  })

  test('a compiler that dies silently is a failure, not a pass', async () => {
    const project = fakeProject('web', 'process.exit(1)')
    await assert.rejects(
      typecheckProjects([project], tmpdir()),
      /tsc did not finish/
    )
  })

  test('a timeout is a failure, not a pass', async () => {
    const project = fakeProject('web', 'setTimeout(() => {}, 30000)')
    await assert.rejects(
      typecheckProjects([project], tmpdir(), { timeoutMs: 100 }),
      /no result in 100ms/
    )
  })

  test('aborting kills the compiler and the child it started', async () => {
    const project = fakeProject(
      'web',
      `const { spawn } = require('node:child_process')
       const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' })
       require('node:fs').writeFileSync('child.pid', String(child.pid))
       setTimeout(() => {}, 30000)`
    )
    const stop = new AbortController()
    const check = typecheckProjects([project], tmpdir(), {
      signal: stop.signal,
    })
    const pidFile = join(project.dir, 'child.pid')
    for (let i = 0; i < 400 && !existsSync(pidFile); i++) await sleep(5)
    const pid = Number(readFileSync(pidFile, 'utf8'))
    assert.ok(alive(pid))
    stop.abort()
    await assert.rejects(check, /superseded/)
    for (let i = 0; i < 200 && alive(pid); i++) await sleep(5)
    assert.equal(alive(pid), false)
  })

  test('one project failing stops the others', async () => {
    const started = Date.now()
    await assert.rejects(
      typecheckProjects(
        [
          fakeProject('dies', 'process.exit(1)'),
          fakeProject('slow', 'setTimeout(() => {}, 30000)'),
        ],
        tmpdir()
      )
    )
    assert.ok(Date.now() - started < 5000)
  })
})
