import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  classifyScenarioRun,
  groupSurvivors,
  pickMutants,
  scoreMutants,
  spliceMutant,
  type Mutant,
  type MutantResult,
} from './scenario-mutate-core.js'

const mutant = (file: string, mutator: string, line: number): Mutant => ({
  file,
  mutator,
  line,
  location: { start: { line, column: 1 }, end: { line, column: 2 } },
  replacement: 'x',
})

describe('spliceMutant', () => {
  test('replaces within one line', () => {
    const out = spliceMutant(
      'a\nreturn a > b\nz',
      {
        start: { line: 2, column: 8 },
        end: { line: 2, column: 15 },
      },
      'a >= b'
    )
    assert.equal(out, 'a\nreturn a >= b\nz')
  })
  test('replaces across lines', () => {
    const out = spliceMutant(
      'if (x) {\n  y()\n}\nend',
      {
        start: { line: 1, column: 8 },
        end: { line: 3, column: 2 },
      },
      '{}'
    )
    assert.equal(out, 'if (x) {}\nend')
  })
  test('first line, no trailing newline', () => {
    assert.equal(
      spliceMutant(
        'a + b',
        { start: { line: 1, column: 1 }, end: { line: 1, column: 6 } },
        'a - b'
      ),
      'a - b'
    )
  })
})

describe('pickMutants', () => {
  test('round-robins mutator types and caps per file', () => {
    const many = [
      ...[1, 2, 3, 4].map((l) => mutant('a.ts', 'Cond', l)),
      mutant('a.ts', 'Arith', 5),
      mutant('a.ts', 'Block', 6),
      mutant('b.ts', 'Cond', 1),
    ]
    const picked = pickMutants(many, 3)
    assert.deepEqual(
      picked.filter((m) => m.file === 'a.ts').map((m) => m.mutator),
      ['Cond', 'Arith', 'Block']
    )
    assert.equal(picked.filter((m) => m.file === 'b.ts').length, 1)
  })
})

describe('classifyScenarioRun', () => {
  test('FAIL line is killed', () => {
    assert.equal(
      classifyScenarioRun({
        code: 1,
        output: 'FAIL x (3ms): boom\n0/1 scenarios passed',
      }),
      'killed'
    )
  })
  test('all passed is survived', () => {
    assert.equal(
      classifyScenarioRun({
        code: 0,
        output: 'PASS x (3ms)\n1/1 scenarios passed against ci',
      }),
      'survived'
    )
  })
  test('nothing reported is setup, or boot if the server died', () => {
    assert.equal(
      classifyScenarioRun({ code: 1, output: 'No scenarios matched.' }),
      'setup'
    )
    assert.equal(
      classifyScenarioRun({ code: 1, output: 'Server exited with 1' }),
      'boot'
    )
  })
  test('timeout', () => {
    assert.equal(
      classifyScenarioRun({ code: null, output: '', timedOut: true }),
      'timeout'
    )
  })
})

describe('scoring', () => {
  const r = (outcome: MutantResult['outcome'], line = 1): MutantResult => ({
    file: 'a.ts',
    mutator: 'M',
    line,
    replacement: '',
    outcome,
  })
  test('inconclusive counts neither way', () => {
    const s = scoreMutants([
      r('killed'),
      r('killed'),
      r('survived'),
      r('inconclusive'),
    ])
    assert.deepEqual(s, {
      killed: 2,
      survived: 1,
      inconclusive: 1,
      score: 66.7,
    })
  })
  test('null when nothing conclusive', () => {
    assert.equal(scoreMutants([r('inconclusive')]).score, null)
  })
  test('survivors grouped and ordered', () => {
    const g = groupSurvivors([
      r('survived', 9),
      r('killed', 1),
      r('survived', 3),
    ])
    assert.deepEqual(
      g['a.ts']!.map((s) => s.line),
      [3, 9]
    )
  })
})
