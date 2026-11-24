import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, describe, test } from 'node:test'
import { HarnessInfraError } from '../finding.js'
import { stageOf } from '../gate.js'
import {
  removeThrowaways,
  runGate,
  testGateWire,
  throwawayRepo,
} from '../test-support.js'
import { checkGate, parsePikkuCheck } from './check.js'

after(removeThrowaways)

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
/** Real output of `pikku check --json` (CLI 0.12, a starter-template project), one file per case. */
const fixture = (name: string) =>
  readFileSync(join(fixtures, 'pikku-check', `${name}.ndjson`), 'utf8')
const raw = (stdout: string, code: number) => ({
  stdout,
  stderr:
    'Using packages/functions/pikku.config.json (found below the current directory)\n',
  code,
})

describe('parsePikkuCheck (pikku check --json)', () => {
  test('a clean run has no findings', () => {
    assert.deepEqual(parsePikkuCheck(raw(fixture('clean'), 0)), [])
  })

  test('a type error is a high finding with its file, line and code', () => {
    assert.deepEqual(parsePikkuCheck(raw(fixture('type-error'), 1)), [
      {
        file: 'src/functions/greet-visitor.function.ts',
        line: 16,
        severity: 'high',
        rule: 'pikku/TS2322',
        message:
          "Type 'string' is not assignable to type 'number'. (project functions)",
      },
    ])
  })

  test('a missing module is a high finding', () => {
    const [finding] = parsePikkuCheck(raw(fixture('missing-module'), 1))
    assert.equal(finding?.rule, 'pikku/TS2307')
    assert.equal(finding?.severity, 'high')
  })

  test('a syntax error gives the codegen criticals (no file) and the type errors', () => {
    const findings = parsePikkuCheck(raw(fixture('syntax-error'), 1))
    assert.deepEqual(
      findings.map((f) => [f.rule, f.severity, f.file ?? null]),
      [
        ['pikku/CODEGEN', 'high', null],
        ['pikku/CODEGEN', 'high', null],
        ['pikku/PKU724', 'high', null],
        ['pikku/TS1109', 'high', 'src/functions/greet-visitor.function.ts'],
        ['pikku/TS1005', 'high', 'src/functions/greet-visitor.function.ts'],
      ]
    )
  })

  test('a warning is a low finding and does not fail the run', () => {
    const line = JSON.stringify({
      ok: true,
      source: 'full-run',
      diagnostics: [
        {
          severity: 'warn',
          code: 'PKU586',
          message: 'a tool has no description',
        },
      ],
      durationMs: 1,
    })
    assert.deepEqual(parsePikkuCheck(raw(`${line}\n`, 0)), [
      {
        severity: 'low',
        rule: 'pikku/PKU586',
        message: 'a tool has no description',
      },
    ])
  })

  test('it fails closed: no result, a stuck run, or an ok that disagrees with the diagnostics or the exit code', () => {
    const result = (value: object, code: number) =>
      parsePikkuCheck(raw(JSON.stringify(value), code))
    assert.throws(() => parsePikkuCheck(raw('', 0)), /no result line/)
    assert.throws(() => parsePikkuCheck(raw('not json\n', 1)), /no result line/)
    assert.throws(() => parsePikkuCheck(raw('{"ok":tru', 1)), /JSON/)
    assert.throws(
      () =>
        result(
          {
            ok: false,
            source: 'watcher',
            diagnostics: [],
            stuck: { stage: 'typecheck', message: 'no answer in 120s' },
          },
          1
        ),
      /got stuck in typecheck: no answer in 120s/
    )
    assert.throws(
      () => result({ ok: false, source: 'full-run', diagnostics: [] }, 1),
      /ok=false with no errors/
    )
    assert.throws(
      () =>
        parsePikkuCheck(
          raw(fixture('type-error').replace('"ok":false', '"ok":true'), 0)
        ),
      /ok=true with errors/
    )
    assert.throws(
      () => parsePikkuCheck(raw(fixture('clean'), 1)),
      /ok=true but exited 1/
    )
    assert.throws(
      () =>
        result(
          {
            ok: false,
            source: 'full-run',
            diagnostics: [{ severity: 'fatal', code: 'X', message: 'x' }],
          },
          1
        ),
      /diagnostic it should not/
    )
  })
})

describe('checkGate', () => {
  const pikku = join(fixtures, 'fake-pikku-check.mjs')

  test('runs first and alone: it writes only generated code', () => {
    assert.equal(stageOf(checkGate), 'check')
  })

  test('runs pikku check --json with the pinned CLI and returns its findings', async () => {
    const repo = await throwawayRepo()
    const wire = testGateWire({ worktree: repo }, { pikku })
    assert.deepEqual(await runGate(checkGate, wire), [])
    const broken = await throwawayRepo({ 'src/broken.ts': 'x\n' })
    const [finding] = await runGate(
      checkGate,
      testGateWire({ worktree: broken }, { pikku })
    )
    assert.equal(finding?.rule, 'pikku/TS2322')
  })

  test('a run with no pikku CLI pinned cannot answer', async () => {
    const repo = await throwawayRepo()
    await assert.rejects(
      runGate(checkGate, testGateWire({ worktree: repo }, {})),
      (error) =>
        error instanceof HarnessInfraError &&
        error.kind === 'missing-binary' &&
        /No pikku is pinned for this run/.test(error.message)
    )
  })
})
