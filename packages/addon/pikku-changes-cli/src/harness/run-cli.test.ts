import assert from 'node:assert/strict'
import { after, describe, test } from 'node:test'
import { HarnessInfraError } from './finding.js'
import { createGateWire } from './gate.js'
import { parseOxlint } from './gates/oxlint-parser.js'
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
        scratch: REPO_ROOT,
      },
      (record) => runs.push(record)
    )
    await wire.runCli(['clean'], { binary: FAKE_CLI, parse: parseOxlint })
    assert.equal(runs.length, 1)
    assert.equal(runs[0]!.exitCode, 0)
    assert.ok(runs[0]!.durationMs >= 0)
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
