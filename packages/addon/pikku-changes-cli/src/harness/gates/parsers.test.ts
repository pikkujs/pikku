import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test } from 'node:test'
import type { RawOutput } from '../run-cli.js'
import { parseOxfmtListDifferent, parseOxfmtWrite } from './oxfmt-parser.js'
import { parseOxlint } from './oxlint-parser.js'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const read = (name: string) => {
  try {
    return readFileSync(join(fixtures, name), 'utf8')
  } catch {
    return ''
  }
}
/** Captured stdout and stderr of a real run, with the exit code it had. */
const captured = (name: string, code: number): RawOutput => ({
  stdout: read(`${name}.stdout`),
  stderr: read(`${name}.stderr`),
  code,
})

describe('parseOxlint (oxlint 1.88.0 --format=json)', () => {
  test('clean', () => {
    assert.deepEqual(parseOxlint(captured('oxlint-clean', 0)), [])
  })

  test('one finding per severity', () => {
    assert.deepEqual(parseOxlint(captured('oxlint-per-severity', 1)), [
      {
        file: 'bad.ts',
        line: 1,
        severity: 'high',
        rule: 'eslint/no-debugger',
        message:
          '`debugger` statement is not allowed. Remove the debugger statement',
      },
      {
        file: 'bad.ts',
        line: 3,
        severity: 'medium',
        rule: 'eslint/use-isnan',
        message:
          'Checking equality with NaN will always return false. Use the `isNaN` function to compare with NaN.',
      },
      {
        file: 'bad.ts',
        line: 3,
        severity: 'low',
        rule: 'eslint/use-isnan',
        message:
          'Checking equality with NaN will always return false. Use the `isNaN` function to compare with NaN.',
      },
    ])
  })

  test('the real error and warning run', () => {
    const findings = parseOxlint(captured('oxlint-error-warning', 1))
    assert.deepEqual(
      findings.map((finding) => finding.severity),
      ['high', 'medium']
    )
  })

  test('no findings with a non-zero exit parses to nothing (runCli then throws)', () => {
    const raw = captured('oxlint-no-files', 1)
    assert.match(raw.stdout, /^No files found to lint/)
    assert.deepEqual(parseOxlint(raw), [])
  })

  test('garbled', () => {
    assert.throws(() => parseOxlint(captured('oxlint-garbled', 1)))
  })

  test('empty', () => {
    assert.throws(() => parseOxlint(captured('empty', 0)), /no JSON object/)
  })

  test('an unknown severity is refused', () => {
    assert.throws(
      () =>
        parseOxlint({
          stdout: '{"diagnostics":[{"message":"m","severity":"fatal"}]}',
          stderr: '',
          code: 1,
        }),
      /unknown oxlint diagnostic severity/
    )
  })
})

describe('parseOxfmtWrite (oxfmt 0.53.0 --write)', () => {
  test('clean', () => {
    assert.deepEqual(parseOxfmtWrite(captured('oxfmt-write', 0)), [])
  })

  test('empty', () => {
    assert.deepEqual(parseOxfmtWrite(captured('empty', 0)), [])
  })

  test('a syntax error is not a clean run', () => {
    assert.throws(
      () => parseOxfmtWrite(captured('oxfmt-syntax-error', 2)),
      /unexpected oxfmt output: x Unexpected token/
    )
  })

  test('garbled', () => {
    assert.throws(() =>
      parseOxfmtWrite({ stdout: 'Finished in', stderr: '', code: 0 })
    )
  })
})

describe('parseOxfmtListDifferent (oxfmt 0.53.0 --list-different)', () => {
  test('one unformatted file', () => {
    assert.deepEqual(
      parseOxfmtListDifferent(captured('oxfmt-list-different', 1)),
      [
        {
          file: 'ugly.ts',
          severity: 'low',
          rule: 'oxfmt',
          message: 'File is not formatted',
        },
      ]
    )
  })

  test('clean and empty', () => {
    assert.deepEqual(parseOxfmtListDifferent(captured('empty', 0)), [])
  })

  test('garbled', () => {
    // the syntax error report, as if it had come on stdout
    const { stderr } = captured('oxfmt-syntax-error', 2)
    assert.throws(
      () => parseOxfmtListDifferent({ stdout: stderr, stderr: '', code: 2 }),
      /not a file path/
    )
  })
})
