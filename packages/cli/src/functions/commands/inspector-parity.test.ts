import { strict as assert } from 'node:assert'
import { describe, test } from 'node:test'
import {
  compareRuns,
  diagnosticLines,
  formatInspectorParity,
  type EngineRun,
} from './inspector-parity.js'

const run = (overrides: Partial<EngineRun> = {}): EngineRun => ({
  state: JSON.stringify({
    functions: { meta: { hello: { pikkuFuncId: 'hello' } } },
    stats: { wallMs: 1 },
  }),
  files: { '.pikku/function/pikku-functions.gen.ts': 'a' },
  log: '',
  ...overrides,
})

describe('compareRuns', () => {
  test('identical runs agree, whatever their timings and run records', () => {
    const result = compareRuns(
      '/p',
      run({
        files: {
          '.pikku/function/pikku-functions.gen.ts': 'a',
          '.pikku/runs/a1.all.jsonl': 'x',
        },
      }),
      run({
        state: JSON.stringify({
          functions: { meta: { hello: { pikkuFuncId: 'hello' } } },
          stats: { wallMs: 9 },
        }),
        files: {
          '.pikku/function/pikku-functions.gen.ts': 'a',
          '.pikku/runs/b2.all.jsonl': 'y',
        },
      }),
      20
    )
    assert.equal(result.identical, true)
    assert.match(formatInspectorParity(result), /Both inspectors agree/)
  })

  test('names the state path an engine got wrong', () => {
    const result = compareRuns(
      '/p',
      run(),
      run({
        state: JSON.stringify({ functions: { meta: {} }, stats: {} }),
      }),
      20
    )
    assert.equal(result.identical, false)
    assert.deepEqual(result.state, [
      '$.functions.meta.hello: {"pikkuFuncId":"hello"} != undefined',
    ])
  })

  test('a generated file that differs or is missing fails', () => {
    const result = compareRuns(
      '/p',
      run({ files: { 'a.gen.ts': '1', 'b.gen.ts': '1' } }),
      run({ files: { 'a.gen.ts': '2' } }),
      20
    )
    assert.equal(result.identical, false)
    assert.deepEqual(result.output.differing, ['a.gen.ts'])
    assert.deepEqual(result.output.onlyInTypescript, ['b.gen.ts'])
  })

  test('a diagnostic only one engine logged fails, counted per line', () => {
    const line = '[PKU577] addGlobalPermission used as a value'
    const result = compareRuns(
      '/p',
      run({ log: `${line}\n${line}\n` }),
      run({ log: `${line}\n` }),
      20
    )
    assert.equal(result.identical, false)
    assert.deepEqual(result.diagnostics.onlyInTypescript, [line])
    assert.deepEqual(result.diagnostics.onlyInNative, [])
  })
})

describe('diagnosticLines', () => {
  test('keeps coded lines, without colour, sorted', () => {
    assert.deepEqual(
      diagnosticLines(
        'Running…\n\x1b[31m[PKU491] b\x1b[0m\n  [PKU100] a\ndone in 3s\n'
      ),
      ['[PKU100] a', '[PKU491] b']
    )
  })
})
