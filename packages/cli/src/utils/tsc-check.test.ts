import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { collectTscDiagnostics, renderTscSummary } from './tsc-check.js'

const ROOT = '/project'

/**
 * Build a minimal ts.Diagnostic. `fileName` null makes a file-less (global)
 * diagnostic; otherwise line/character are returned verbatim by a stub
 * getLineAndCharacterOfPosition so we can assert 1-based conversion.
 */
function diag(
  code: number,
  message: string,
  category: ts.DiagnosticCategory,
  fileName: string | null,
  line = 0,
  character = 0
): ts.Diagnostic {
  const file =
    fileName === null
      ? undefined
      : ({
          fileName,
          getLineAndCharacterOfPosition: () => ({ line, character }),
        } as unknown as ts.SourceFile)
  return {
    file,
    start: 0,
    length: 0,
    code,
    category,
    messageText: message,
  } as ts.Diagnostic
}

describe('collectTscDiagnostics', () => {
  test('counts errors/warnings and converts positions to 1-based', () => {
    const result = collectTscDiagnostics(
      [
        diag(
          2345,
          'bad arg',
          ts.DiagnosticCategory.Error,
          `${ROOT}/src/a.ts`,
          4,
          2
        ),
        diag(
          6133,
          'unused',
          ts.DiagnosticCategory.Warning,
          `${ROOT}/src/b.ts`,
          0,
          0
        ),
      ],
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

  test('drops node_modules and out-of-root diagnostics', () => {
    const result = collectTscDiagnostics(
      [
        diag(
          1,
          'x',
          ts.DiagnosticCategory.Error,
          `${ROOT}/node_modules/dep/index.d.ts`,
          1,
          1
        ),
        diag(2, 'y', ts.DiagnosticCategory.Error, '/elsewhere/z.ts', 1, 1),
        diag(
          3,
          'keep',
          ts.DiagnosticCategory.Error,
          `${ROOT}/src/keep.ts`,
          1,
          1
        ),
      ],
      ROOT
    )
    assert.equal(result.errorCount, 1)
    assert.equal(result.diagnostics.length, 1)
    assert.equal(result.diagnostics[0]!.file, 'src/keep.ts')
  })

  test('keeps file-less (global) diagnostics under the project label', () => {
    const result = collectTscDiagnostics(
      [diag(18003, 'No inputs were found', ts.DiagnosticCategory.Error, null)],
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
    const result = collectTscDiagnostics(
      [
        diag(
          2345,
          'Argument bad',
          ts.DiagnosticCategory.Error,
          `${ROOT}/src/a.ts`,
          4,
          2
        ),
      ],
      ROOT
    )
    const out = renderTscSummary(result)
    const lines = out.split('\n')
    assert.equal(lines[0], 'Type check: 1 error in 1 file')
    assert.equal(lines[1], '  src/a.ts:5:3  TS2345  Argument bad')
    assert.equal(lines.length, 2)
  })

  test('caps output and reports the remainder', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      diag(
        1000 + i,
        `err ${i}`,
        ts.DiagnosticCategory.Error,
        `${ROOT}/src/f${i}.ts`,
        i,
        0
      )
    )
    const result = collectTscDiagnostics(many, ROOT)
    const out = renderTscSummary(result, 2)
    const lines = out.split('\n')
    // header + 2 shown + 1 "and N more"
    assert.equal(lines.length, 4)
    assert.match(lines.at(-1)!, /… and 3 more/)
  })
})
