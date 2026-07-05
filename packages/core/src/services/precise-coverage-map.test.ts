import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mapPreciseCoverage } from './precise-coverage-map.js'

// A plain-JS "transpiled" script (no source map → identity line mapping).
// Offsets are byte positions into this exact string.
const lines = [
  'function coveredFn(n) {', // line 1
  '  return n * 2', // 2
  '}', // 3
  'function missedFn(n) {', // 4
  '  return n + 1', // 5
  '}', // 6
  'coveredFn(1)', // 7
]
const source = lines.join('\n')
const offsetOf = (line: number) =>
  lines.slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0)

const scriptUrl = 'file:///proj/src/things.function.ts'

const scripts = [
  {
    scriptId: '1',
    url: scriptUrl,
    functions: [
      {
        functionName: 'coveredFn',
        isBlockCoverage: true,
        ranges: [{ startOffset: 0, endOffset: offsetOf(3) + 1, count: 1 }],
      },
      {
        functionName: 'missedFn',
        isBlockCoverage: true,
        ranges: [
          {
            startOffset: offsetOf(4),
            endOffset: offsetOf(6) + 1,
            count: 0,
          },
        ],
      },
    ],
  },
]

const meta = {
  coveredFn: {
    name: 'coveredFn',
    sourceFile: '/proj/src/things.function.ts',
    exportedName: 'coveredFn',
    expose: true,
    description: null,
    bodyStart: 2,
    bodyEnd: 2,
  },
  missedFn: {
    name: 'missedFn',
    sourceFile: '/proj/src/things.function.ts',
    exportedName: 'missedFn',
    expose: true,
    description: null,
    bodyStart: 5,
    bodyEnd: 5,
  },
}

describe('mapPreciseCoverage', () => {
  test('maps V8 script coverage onto function body spans', async () => {
    const report = await mapPreciseCoverage(
      scripts,
      async () => source,
      meta as any
    )
    const covered = report.functions.find((f) => f.name === 'coveredFn')
    const missed = report.functions.find((f) => f.name === 'missedFn')
    assert.ok(covered && missed)
    assert.equal(covered.status, 'covered')
    assert.equal(covered.ratio, 1)
    assert.equal(missed.status, 'uncovered')
    assert.deepEqual(missed.missedLines, [5])
    assert.equal(report.summary.total, 2)
    assert.equal(report.summary.covered, 1)
    assert.equal(report.summary.uncovered, 1)
  })

  test('functions whose source never appears in coverage are unknown', async () => {
    const report = await mapPreciseCoverage(scripts, async () => source, {
      ...meta,
      ghostFn: {
        name: 'ghostFn',
        sourceFile: '/proj/src/ghost.function.ts',
        exportedName: 'ghostFn',
        expose: true,
        description: null,
        bodyStart: 2,
        bodyEnd: 3,
      },
    } as any)
    const ghost = report.functions.find((f) => f.name === 'ghostFn')
    assert.equal(ghost?.status, 'unknown')
  })

  test('cross-file handlers read hits from bodySourceFile, not the wiring file', async () => {
    const report = await mapPreciseCoverage(scripts, async () => source, {
      importedFn: {
        name: 'importedFn',
        sourceFile: '/proj/src/wirings.ts',
        bodySourceFile: '/proj/src/things.function.ts',
        exportedName: 'importedFn',
        expose: true,
        description: null,
        bodyStart: 2,
        bodyEnd: 2,
      },
    } as any)
    const imported = report.functions.find((f) => f.name === 'importedFn')
    assert.equal(imported?.status, 'covered')
    assert.equal(imported?.ratio, 1)
  })

  test('relative sourcemap sources resolve against sourceRoot before matching meta', async () => {
    // Single-line generated output (esbuild-style) with an inline map whose
    // sources entry is relative; sourceRoot supplies the absolute prefix.
    const generated = 'function coveredFn(n){return n*2}coveredFn(1);'
    const map = {
      version: 3,
      sourceRoot: 'file:///proj/src/',
      sources: ['things.function.ts'],
      names: [],
      // every generated column maps to line 2 of the original source
      mappings: 'AACA,kBAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC',
    }
    const inlined =
      generated +
      '\n//# sourceMappingURL=data:application/json;base64,' +
      Buffer.from(JSON.stringify(map)).toString('base64')
    const report = await mapPreciseCoverage(
      [
        {
          scriptId: '9',
          url: 'file:///proj/dist/things.function.js',
          functions: [
            {
              functionName: 'coveredFn',
              isBlockCoverage: true,
              ranges: [
                { startOffset: 0, endOffset: generated.length, count: 1 },
              ],
            },
          ],
        },
      ],
      async () => inlined,
      {
        coveredFn: {
          name: 'coveredFn',
          sourceFile: '/proj/src/things.function.ts',
          exportedName: 'coveredFn',
          expose: true,
          description: null,
          bodyStart: 2,
          bodyEnd: 2,
        },
      } as any
    )
    const covered = report.functions.find((f) => f.name === 'coveredFn')
    assert.equal(covered?.status, 'covered')
  })
})
