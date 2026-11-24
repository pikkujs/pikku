import { strict as assert } from 'node:assert'
import { describe, test } from 'node:test'
import {
  serializeHarnessGateNames,
  serializeHarnessMeta,
} from './serialize-harness.js'

const state = {
  functions: {
    meta: {
      createTodo: { pikkuFuncId: 'createTodo' },
      check: {
        pikkuFuncId: 'check',
        harness: true,
        failOn: 'high',
        writes: ['.pikku/**'],
        workflowTimeout: '5min',
      },
    },
  },
  harness: {
    harnessesMeta: {
      build: {
        name: 'build',
        description: 'Builds one changeset',
        harness: true,
        agent: { model: 'default' },
        gates: [{ name: 'check' }, { name: 'review', failOn: 'medium' }],
        sourceFile: '/p/src/harness.ts',
      },
    },
    gateAgentsMeta: {
      review: {
        name: 'review',
        description: 'Reads the diff',
        harness: true,
        model: 'cheap',
        goal: 'No dead code',
        failOn: 'high',
        sourceFile: '/p/src/harness.ts',
      },
    },
  },
} as any

describe('serializeHarnessMeta', () => {
  test('holds every harness, gate agent and gate, and no app function', () => {
    const meta = JSON.parse(serializeHarnessMeta(state))
    assert.deepEqual(Object.keys(meta), [
      'harnessesMeta',
      'gateAgentsMeta',
      'gatesMeta',
    ])
    assert.deepEqual(meta.harnessesMeta, state.harness.harnessesMeta)
    assert.deepEqual(meta.gateAgentsMeta, state.harness.gateAgentsMeta)
    assert.deepEqual(meta.gatesMeta, { check: state.functions.meta.check })
  })

  test('is empty, not missing, for a project with no harness', () => {
    const meta = JSON.parse(
      serializeHarnessMeta({ functions: { meta: {} } } as any)
    )
    assert.deepEqual(meta, {
      harnessesMeta: {},
      gateAgentsMeta: {},
      gatesMeta: {},
    })
  })
})

describe('serializeHarnessGateNames', () => {
  test('is the union of gate and gate agent names', () => {
    assert.match(
      serializeHarnessGateNames(state),
      /export type HarnessGateName = 'check' \| 'review'\n/
    )
  })

  test('is never when nothing is declared, so any name is refused', () => {
    assert.match(
      serializeHarnessGateNames({ functions: { meta: {} } } as any),
      /export type HarnessGateName = never\n/
    )
  })
})
