import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { pikkuHarnessGate } from '@pikku/core/harness'
import { mkdir, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { HarnessInfraError } from './finding.js'
import { runGateOnce } from './engine.js'
import { createGateWire, toolLocksIn } from './gate.js'
import { parseOxlint } from './gates/oxlint-parser.js'
import {
  groupAlive,
  isAlive,
  processStartTime,
  readLock,
  stopGroup,
  writeLock,
} from './pi-process.js'
import { redact } from './redact.js'
import { cleanOutput, runCli, trimOutput } from './run-cli.js'
import {
  FAKE_CLI,
  REPO_ROOT,
  removeThrowaways,
  throwawayRepo,
} from './test-support.js'

const SECRET = ['AK', 'IA', 'FAKE', 'FAKE', 'FAKE', 'FAKE'].join('')
const run = (mode: string, extra: Partial<Parameters<typeof runCli>[1]> = {}) =>
  runCli([mode], {
    cwd: REPO_ROOT,
    binary: FAKE_CLI,
    parse: parseOxlint,
    timeoutMs: 10_000,
    ...extra,
  })

const infra = async (promise: Promise<unknown>, kind: string) => {
  try {
    await promise
  } catch (error) {
    assert.ok(error instanceof HarnessInfraError, String(error))
    assert.equal(error.kind, kind, error.message)
    return error
  }
  assert.fail(`expected a ${kind} infra error`)
}

const noSecret = (error: HarnessInfraError) => {
  const lower = SECRET.toLowerCase()
  for (const text of [error.message, error.output ?? '', error.stack ?? '']) {
    assert.ok(!text.includes(SECRET), text)
    assert.ok(!text.includes(lower), text)
  }
}

after(removeThrowaways)

describe('runCli', () => {
  test('redacts a secret from the findings', async () => {
    const findings = await run('secret-finding')
    assert.equal(findings.length, 1)
    assert.equal(findings[0]!.message, 'leaked [REDACTED] here')
    assert.equal(findings[0]!.severity, 'high')
    assert.equal(findings[0]!.file, 'a.ts')
  })

  test('unparseable output throws without the secret in the error', async () => {
    const error = await infra(run('secret-garbled'), 'unparseable')
    noSecret(error)
    assert.match(error.message, /\[REDACTED\]/)
  })

  test('an exit outside okCodes with no findings throws, redacted', async () => {
    const error = await infra(
      run('secret-exit', { parse: () => [] }),
      'exit-code'
    )
    assert.equal(error.exitCode, 3)
    noSecret(error)
    assert.match(error.output!, /password=\[REDACTED\]/)
  })

  test('an exit outside okCodes with findings returns them', async () => {
    const findings = await run('secret-finding', { okCodes: [0] })
    assert.equal(findings.length, 1)
  })

  test('a parser that returns something other than Finding[] is unparseable', async () => {
    await infra(
      run('clean', {
        parse: () => [{ severity: 'critical', message: 'x' }] as never,
      }),
      'unparseable'
    )
  })

  test('a missing binary throws', async () => {
    await infra(
      run('clean', { binary: `${REPO_ROOT}/.tmp/no-such-tool` }),
      'missing-binary'
    )
  })

  test('a binary on PATH is refused: it must be absolute', async () => {
    await infra(run('clean', { binary: 'node' }), 'missing-binary')
  })

  test('a slow tool times out', async () => {
    const started = Date.now()
    await infra(run('sleep', { timeoutMs: 300 }), 'timeout')
    assert.ok(Date.now() - started < 5_000)
  })

  test('an aborted signal stops the tool', async () => {
    const controller = new AbortController()
    const runs: { exitCode: number | null }[] = []
    const started = Date.now()
    setTimeout(() => controller.abort(), 300)
    await infra(
      run('sleep', {
        signal: controller.signal,
        onRun: (record) => runs.push(record),
      }),
      'aborted'
    )
    assert.ok(Date.now() - started < 5_000)
    assert.deepEqual(
      runs.map(({ exitCode }) => exitCode),
      [null]
    )
  })

  test('a signal aborted beforehand never starts the tool', async () => {
    const runs: unknown[] = []
    await infra(
      run('clean', {
        signal: AbortSignal.abort(),
        onRun: (record) => runs.push(record),
      }),
      'aborted'
    )
    assert.equal(runs.length, 0)
  })

  test('the tool runs in cwd and does not see the caller environment', async () => {
    process.env.HARNESS_TEST_TOKEN = 'from-parent'
    try {
      const repo = await throwawayRepo()
      const seen: string[] = []
      await runCli(['clean'], {
        cwd: repo,
        binary: FAKE_CLI,
        parse: (raw) => (seen.push(raw.stdout), []),
      })
      assert.deepEqual(seen, ['{"diagnostics":[]}'])
      const [finding] = await run('env')
      assert.equal(finding!.message, 'env unset')
      const [given] = await run('env', { env: { HARNESS_TEST_TOKEN: 'given' } })
      assert.equal(given!.message, 'env given')
    } finally {
      delete process.env.HARNESS_TEST_TOKEN
    }
  })

  test('an error shows cleaned output: no colour codes, logo or progress', async () => {
    const error = await infra(
      run('decorated', { parse: () => [] }),
      'exit-code'
    )
    assert.equal(error.output, 'broken output')
  })

  test('reports duration and exit code through the gate wire', async () => {
    const runs: { durationMs: number; exitCode: number | null }[] = []
    const wire = createGateWire(
      {
        worktree: REPO_ROOT,
        base: 'main',
        attempt: 1,
        changeId: 'c1',
        input: undefined,
        scratch: REPO_ROOT,
      },
      {},
      (record) => runs.push(record)
    )
    await wire.runCli(['clean'], { binary: FAKE_CLI, parse: parseOxlint })
    assert.equal(runs.length, 1)
    assert.equal(runs[0]!.exitCode, 0)
    assert.ok(runs[0]!.durationMs >= 0)
  })
})

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms))

const until = async (check: () => Promise<boolean>, what: string) => {
  for (let i = 0; i < 100; i++) {
    if (await check()) return
    await pause(50)
  }
  assert.fail(`timed out waiting for ${what}`)
}

/** A detached group like a tool a killed server left behind: a leader and one child. */
const leftover = async () => {
  const child = spawn(
    process.execPath,
    [
      '-e',
      "require('child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); setInterval(() => {}, 1000)",
    ],
    { detached: true, stdio: 'ignore' }
  )
  child.unref()
  const pid = child.pid!
  await pause(200)
  return { pid, startTime: (await processStartTime(pid))! }
}

/** A gate that starts no tool, run once in `scratch`. */
const runToolless = (scratch: string) =>
  runGateOnce(
    pikkuHarnessGate({
      name: 'toolless',
      description: 'Finds nothing',
      failOn: 'high',
      writes: [],
      func: async () => [],
    }),
    {
      worktree: REPO_ROOT,
      base: 'HEAD',
      attempt: 1,
      changeId: 'chg_test',
      input: undefined,
      scratch,
    },
    { services: {}, tools: {} }
  )

describe('gate tools: own process group, locks and orphans', () => {
  test('an abort stops what the tool started, not only the tool', async () => {
    const dir = await throwawayRepo()
    const pidFile = join(dir, 'child.pid')
    const controller = new AbortController()
    const running = runCli(['spawn-sleep', pidFile], {
      cwd: dir,
      binary: FAKE_CLI,
      parse: () => [],
      timeoutMs: 10_000,
      signal: controller.signal,
    })
    let child = 0
    await until(async () => {
      child = Number(await readFile(pidFile, 'utf8').catch(() => '0'))
      return child > 0
    }, 'the tool to start its child')
    assert.ok(await isAlive(child))
    controller.abort()
    await infra(running, 'aborted')
    assert.equal(await isAlive(child), false)
  })

  test('the tool is locked by pid, group and start time while it runs, and unlocked after', async () => {
    const lockDir = join(await throwawayRepo(), 'tools')
    const running = runCli(['sleep', '400'], {
      cwd: REPO_ROOT,
      binary: FAKE_CLI,
      parse: () => [],
      lockDir,
    })
    let names: string[] = []
    await until(async () => {
      names = await readdir(lockDir).catch(() => [])
      return (
        names.length === 1 &&
        (await readLock(join(lockDir, names[0]!)))?.startTime !== undefined
      )
    }, 'the lock')
    const lock = (await readLock(join(lockDir, names[0]!)))!
    assert.equal(names[0], `${lock.pid}.lock`)
    assert.equal(lock.pgid, lock.pid)
    assert.equal(lock.startTime, await processStartTime(lock.pid))
    assert.equal(lock.tool, FAKE_CLI)
    assert.deepEqual(await running, [])
    assert.deepEqual(await readdir(lockDir), [])
  })

  test('a tool left running by a killed server is stopped before its gate runs again, even a run that starts no tool', async () => {
    const scratch = await throwawayRepo()
    const lockDir = toolLocksIn(scratch)
    await mkdir(lockDir, { recursive: true })
    const orphan = await leftover()
    try {
      await writeLock(join(lockDir, `${orphan.pid}.lock`), {
        pid: orphan.pid,
        pgid: orphan.pid,
        startTime: orphan.startTime,
        tool: FAKE_CLI,
        startedAt: new Date().toISOString(),
      })
      assert.deepEqual(await runToolless(scratch), [])
      assert.equal(groupAlive(orphan.pid), false)
      assert.deepEqual(await readdir(lockDir), [])
    } finally {
      await stopGroup(orphan.pid, 100)
    }
  })

  test('a lock whose pid now has another start time is a reused pid: removed, nothing killed', async () => {
    const scratch = await throwawayRepo()
    const lockDir = toolLocksIn(scratch)
    await mkdir(lockDir, { recursive: true })
    const other = await leftover()
    try {
      await writeLock(join(lockDir, `${other.pid}.lock`), {
        pid: other.pid,
        pgid: other.pid,
        startTime: `${Number(other.startTime) - 1}`,
        tool: FAKE_CLI,
        startedAt: new Date().toISOString(),
      })
      assert.deepEqual(await runToolless(scratch), [])
      assert.ok(await isAlive(other.pid))
      assert.ok(groupAlive(other.pid))
      assert.deepEqual(await readdir(lockDir), [])
    } finally {
      await stopGroup(other.pid, 100)
    }
  })

  test('a tool this process is running is not taken for an orphan', async () => {
    const scratch = await throwawayRepo()
    const lockDir = toolLocksIn(scratch)
    const first = runCli(['sleep', '1500'], {
      cwd: REPO_ROOT,
      binary: FAKE_CLI,
      parse: () => [],
      lockDir,
    })
    await until(
      async () => (await readdir(lockDir).catch(() => [])).length === 1,
      'the first lock'
    )
    assert.deepEqual(await runToolless(scratch), [])
    assert.deepEqual(await first, [])
  })
})

describe('output helpers', () => {
  test('trimOutput keeps the start and the end', () => {
    const text = `${'a'.repeat(100)}${'b'.repeat(1000)}${'c'.repeat(100)}`
    const trimmed = trimOutput(text, 400)
    assert.ok(trimmed.startsWith('a'.repeat(100)))
    assert.ok(trimmed.endsWith('c'.repeat(100)))
    assert.match(trimmed, /800 characters trimmed/)
  })

  test('cleanOutput keeps the last redraw of a line', () => {
    assert.equal(cleanOutput('step 1\rstep 2\rdone\nnext'), 'done\nnext')
  })

  test('redact covers the known shapes', () => {
    const ghp = `ghp_${'a'.repeat(36)}`
    const text = `k ${SECRET} ${ghp} Authorization: Bearer abcdefghijklmnop API_KEY="supersecretvalue" https://user:pw12345@host/x`
    const out = redact(text)
    for (const leaked of [
      SECRET,
      ghp,
      'abcdefghijklmnop',
      'supersecretvalue',
      'pw12345',
    ])
      assert.ok(!out.includes(leaked), out)
    assert.match(out, /API_KEY="\[REDACTED\]"/)
  })
})
