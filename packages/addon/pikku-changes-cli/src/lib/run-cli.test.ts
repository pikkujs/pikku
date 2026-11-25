import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { HarnessInfraError, type Finding } from './finding.js'
import {
  groupAlive,
  isAlive,
  processStartTime,
  readLock,
  stopGroup,
} from './process-group.js'
import { redact } from './redact.js'
import { cleanOutput, runCli, trimOutput, type Parse } from './run-cli.js'
import {
  FAKE_CLI,
  REPO_ROOT,
  removeThrowaways,
  throwawayRepo,
} from './test-support.js'

const SECRET = ['AK', 'IA', 'FAKE', 'FAKE', 'FAKE', 'FAKE'].join('')

/** The fake CLI's `{ diagnostics }` output as findings; anything else throws. */
const parseDiagnostics: Parse = ({ stdout }) =>
  (
    JSON.parse(stdout) as {
      diagnostics: { message: string; severity: string; filename?: string }[]
    }
  ).diagnostics.map((diagnostic): Finding => ({
    message: diagnostic.message,
    severity: diagnostic.severity === 'error' ? 'high' : 'medium',
    ...(diagnostic.filename ? { file: diagnostic.filename } : {}),
  }))

const run = (mode: string, extra: Partial<Parameters<typeof runCli>[1]> = {}) =>
  runCli([mode], {
    cwd: REPO_ROOT,
    binary: FAKE_CLI,
    parse: parseDiagnostics,
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
})

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms))

const until = async (check: () => Promise<boolean>, what: string) => {
  for (let i = 0; i < 100; i++) {
    if (await check()) return
    await pause(50)
  }
  assert.fail(`timed out waiting for ${what}`)
}

describe('tools: own process group and locks', () => {
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

  test('a process stopped by SIGTERM mid-tool takes the tool and what it started with it', async () => {
    const dir = await throwawayRepo()
    const lockDir = join(dir, 'tools')
    const pidFile = join(dir, 'child.pid')
    const runner = spawn(
      process.execPath,
      [
        '-e',
        `import { runCli } from ${JSON.stringify(new URL('./run-cli.ts', import.meta.url).pathname)}
await runCli(['spawn-sleep', ${JSON.stringify(pidFile)}], { cwd: ${JSON.stringify(dir)}, binary: ${JSON.stringify(FAKE_CLI)}, parse: () => [], timeoutMs: 60_000, lockDir: ${JSON.stringify(lockDir)} })`,
      ],
      { stdio: 'ignore' }
    )
    const ended = new Promise<NodeJS.Signals | null>((done) =>
      runner.once('exit', (_code, signal) => done(signal))
    )
    let child = 0
    await until(async () => {
      child = Number(await readFile(pidFile, 'utf8').catch(() => '0'))
      return child > 0 && (await readdir(lockDir).catch(() => [])).length === 1
    }, 'the tool to start its child')
    const [lock] = await readdir(lockDir)
    const tool = Number(lock!.replace(/\.lock$/, ''))
    try {
      assert.ok(groupAlive(tool))
      runner.kill('SIGTERM')
      assert.equal(await ended, 'SIGTERM', 'the runner ends as SIGTERM ends it')
      await until(async () => !groupAlive(tool), 'the group to go')
      assert.equal(await isAlive(child), false)
    } finally {
      await stopGroup(tool, 100)
    }
  })
})

describe('tracked process groups', () => {
  test('a process stopped by SIGTERM lets a tracked leader stop the groups it started itself before it is killed', async () => {
    const dir = await throwawayRepo()
    const pidFile = join(dir, 'grandchild.pid')
    // The leader runs as Pi does: its tool runs detached in a group of its own, which it kills on SIGTERM.
    const leader = `const { spawn } = require('node:child_process')
const tool = spawn('sleep', ['400'], { detached: true, stdio: 'ignore' })
require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(tool.pid))
process.on('SIGTERM', () => { try { process.kill(-tool.pid, 'SIGKILL') } catch {} process.exit(143) })
setInterval(() => {}, 1000)`
    const runner = spawn(
      process.execPath,
      [
        '-e',
        `import { spawn } from 'node:child_process'
import { trackGroup } from ${JSON.stringify(new URL('./process-group.ts', import.meta.url).pathname)}
const leader = spawn(process.execPath, ['-e', ${JSON.stringify(leader)}], { detached: true, stdio: 'ignore' })
trackGroup(leader.pid)
setInterval(() => {}, 1000)`,
      ],
      { stdio: 'ignore' }
    )
    const ended = new Promise<NodeJS.Signals | null>((done) =>
      runner.once('exit', (_code, signal) => done(signal))
    )
    let tool = 0
    await until(async () => {
      tool = Number(await readFile(pidFile, 'utf8').catch(() => '0'))
      return tool > 0
    }, 'the leader to start its tool')
    try {
      assert.ok(groupAlive(tool))
      runner.kill('SIGTERM')
      assert.equal(await ended, 'SIGTERM', 'the runner ends as SIGTERM ends it')
      await until(
        async () => !groupAlive(tool),
        'the tool the leader started to go'
      )
    } finally {
      await stopGroup(tool, 100)
    }
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
