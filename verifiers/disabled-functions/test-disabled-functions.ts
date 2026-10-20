import { test } from 'node:test'
import * as assert from 'node:assert'
import { spawnSync } from 'node:child_process'
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { closeSync, openSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const root = process.cwd()
const CLI = join(root, '../../packages/cli/dist/bin/pikku.js')

const pikku = (...args: string[]) =>
  spawnSync('node', [CLI, ...args], { cwd: root, encoding: 'utf8' })

type Finding = { code?: string; severity: string; message: string }

/** `pikku verify --json`. Other checks (repo-wide lint, typecheck) may fail it too, so tests look at the codes. */
const verifyResult = (): { ok: boolean; findings: Finding[] } => {
  // The JSON result can pass 64KB, more than a pipe delivers before the CLI
  // exits, so it goes to a file.
  const out = join(tmpdir(), `pikku-verify-${process.pid}.json`)
  const fd = openSync(out, 'w')
  try {
    spawnSync('node', [CLI, 'verify', '--json'], {
      cwd: root,
      stdio: ['ignore', fd, 'ignore'],
    })
  } finally {
    closeSync(fd)
  }
  try {
    const line = readFileSync(out, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('{"ok"'))
    assert.ok(line, 'pikku verify --json printed no result')
    return JSON.parse(line)
  } finally {
    rmSync(out, { force: true })
  }
}

/** Every coded log line `pikku all --json` printed. */
const logLines = (stderr: string) =>
  stderr
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .flatMap((line) => {
      try {
        return [
          JSON.parse(line) as {
            level?: string
            code?: string
            message?: string
          },
        ]
      } catch {
        return []
      }
    })

/** Adds a source file for one test and removes it whatever the assertions do. */
const withFile = async (
  name: string,
  lines: string[],
  body: () => Promise<void> | void
) => {
  const path = join(root, 'src', 'functions', name)
  await writeFile(path, lines.join('\n'))
  try {
    await body()
  } finally {
    await rm(path, { force: true })
  }
}

const generatedFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? generatedFiles(join(dir, entry.name))
        : [join(dir, entry.name)]
    )
  )
  return files.flat()
}

test('a disabled function is in no generated file', async () => {
  for (const file of await generatedFiles(join(root, '.pikku'))) {
    if (file.endsWith('inspector-state.json')) continue
    const text = await readFile(file, 'utf8')
    assert.ok(!text.includes('oldReport'), `${file} mentions oldReport`)
  }
})

test('pikku all names the disabled functions once, with file and reason', () => {
  const run = pikku('all', '--json')
  assert.equal(run.status, 0, run.stderr)
  const summaries = logLines(run.stderr).filter((line) =>
    line.message?.includes('disabled function')
  )
  assert.equal(summaries.length, 1, run.stderr)
  assert.match(
    summaries[0]!.message!,
    /oldReport \(src\/functions\/report\.functions\.ts\): replaced by liveReport/
  )
})

test('a wiring that references a disabled function fails the build', async () => {
  await withFile(
    'old.wiring.ts',
    [
      "import { wireHTTP } from '#pikku/http'",
      "import { oldReport } from './report.functions.js'",
      "wireHTTP({ method: 'get', route: '/old', func: oldReport, auth: false })",
    ],
    () => {
      const run = pikku('all', '--json')
      assert.notEqual(run.status, 0)
      const referenced = logLines(run.stderr).filter(
        (line) => line.code === 'PKU562'
      )
      assert.ok(referenced.length > 0, run.stderr)
      assert.match(
        referenced[0]!.message!,
        /'oldReport' is disabled \(replaced by liveReport\) in src\/functions\/report\.functions\.ts, but wireHTTP\(\.\.\.\) references it at src\/functions\/old\.wiring\.ts:3/
      )
    }
  )
  // Leave the generated files as the clean project makes them.
  assert.equal(pikku('all').status, 0)
})

test('pikku verify fails on an app function nothing uses', async () => {
  await withFile(
    'forgotten.functions.ts',
    [
      "import { pikkuSessionlessFunc } from '#pikku/function'",
      'export const forgotten = pikkuSessionlessFunc<void, string>({',
      "  func: async () => 'nobody calls me',",
      '})',
    ],
    () => {
      const build = pikku('all', '--json')
      assert.equal(
        build.status,
        0,
        'an unused function does not fail pikku all'
      )
      const unused = logLines(build.stderr).filter(
        (line) => line.code === 'PKU563'
      )
      assert.equal(unused.length, 1, build.stderr)
      assert.match(
        unused[0]!.message!,
        /'forgotten' in src\/functions\/forgotten\.functions\.ts is not wired, exposed or called by anything/
      )
      const verify = verifyResult()
      assert.equal(verify.ok, false)
      assert.ok(
        verify.findings.some(
          (f) => f.code === 'PKU563' && f.severity === 'error'
        ),
        JSON.stringify(verify.findings)
      )
    }
  )
  assert.equal(pikku('all').status, 0)
})

test('pikku verify reports nothing unused when every app function is used or disabled', () => {
  const verify = verifyResult()
  assert.deepEqual(
    verify.findings.filter((f) => f.code === 'PKU563' || f.code === 'PKU562'),
    []
  )
})
