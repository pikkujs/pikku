import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  pikkuHarness,
  pikkuHarnessGate,
  pikkuHarnessGateAgent,
} from './harness.js'
import type { HarnessFinding } from './harness.types.js'

const check = pikkuHarnessGate({
  name: 'check',
  description: 'Runs the type-check',
  failOn: 'high',
  workflowTimeout: '5m',
  func: async (): Promise<HarnessFinding[]> => [
    { severity: 'high', message: 'Type error', file: 'src/a.ts', line: 3 },
  ],
})

const review = pikkuHarnessGateAgent({
  name: 'review',
  description: 'Reads the diff for dead code',
  model: 'cheap',
  goal: 'The diff adds no unused code',
  failOn: 'medium',
})

describe('pikkuHarnessGate', () => {
  test('is a function config whose body returns findings', async () => {
    assert.equal(check.name, 'check')
    assert.equal(check.failOn, 'high')
    assert.equal(check.workflowTimeout, '5m')
    assert.deepEqual(await check.func({}, undefined, {} as any), [
      { severity: 'high', message: 'Type error', file: 'src/a.ts', line: 3 },
    ])
  })

  test('keeps the rules a person may waive', () => {
    const pages = pikkuHarnessGate({
      name: 'pages',
      description: 'Compares the pages with the original',
      failOn: 'high',
      waivable: ['harness/pages-phone'],
      func: async () => [],
    })
    assert.deepEqual(pages.waivable, ['harness/pages-phone'])
    assert.equal(check.waivable, undefined)
  })

  test('may write only .pikku/** unless it says otherwise', () => {
    assert.deepEqual(check.writes, ['.pikku/**'])
    const format = pikkuHarnessGate({
      name: 'format',
      description: 'Formats the changed files',
      failOn: 'medium',
      writes: ['**/*.{ts,tsx}'],
      func: async () => [],
    })
    assert.deepEqual(format.writes, ['**/*.{ts,tsx}'])
  })

  test('with() overrides failOn for one harness and leaves the gate alone', () => {
    assert.deepEqual(check.with({ failOn: 'low' }), {
      name: 'check',
      failOn: 'low',
    })
    assert.equal(check.failOn, 'high')
  })
})

describe('pikkuHarnessGateAgent', () => {
  test('keeps its model, goal and failOn', () => {
    assert.equal(review.model, 'cheap')
    assert.equal(review.goal, 'The diff adds no unused code')
    assert.equal(review.failOn, 'medium')
    assert.equal('func' in review, false)
    assert.deepEqual(review.with({ failOn: 'high' }), {
      name: 'review',
      failOn: 'high',
    })
  })
})

describe('pikkuHarness', () => {
  test('returns its config: names, references and overrides', () => {
    const harness = pikkuHarness<'format' | 'check' | 'review'>({
      name: 'build',
      description: 'Builds one changeset',
      agent: { model: 'default' },
      gates: ['format', check, review.with({ failOn: 'high' })],
    })
    assert.equal(harness.agent.model, 'default')
    assert.equal(harness.gates[0], 'format')
    assert.equal(harness.gates[1], check)
    assert.deepEqual(harness.gates[2], { name: 'review', failOn: 'high' })
  })

  test('a gate name outside the generated union is a type error', () => {
    pikkuHarness<'check'>({
      name: 'typo',
      description: 'Lists a gate nobody declares',
      agent: { model: 'default' },
      // @ts-expect-error 'chek' is not a declared gate name
      gates: ['chek'],
    })
  })
})
