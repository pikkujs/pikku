import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parseTscOutput, renderTscSummary, renderTscFull } from './tsc-check.js'

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
