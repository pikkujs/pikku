import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildStepLadder,
  collectScenarioStepProse,
  scenarioBrowserSteps,
} from './scenario-ladder.js'

const workflowMeta = () => ({
  steps: [
    {
      type: 'scenarioStep',
      stepName: 'buys an apple',
      stepFunc: 'buysAnApple',
      phase: 'given',
      actor: 'shopper',
    },
    {
      type: 'scenarioStep',
      stepName: 'checks out',
      stepFunc: 'checksOut',
      phase: 'when',
      actor: 'shopper',
      options: { description: 'completes the checkout' },
    },
    {
      type: 'parallel',
      children: [
        {
          type: 'scenarioStep',
          stepName: 'sees a receipt',
          stepFunc: 'seesAReceipt',
          phase: 'then',
          actor: 'shopper',
        },
      ],
    },
    { type: 'rpc', stepName: 'seeds data', rpcName: 'seedData' },
  ],
})

const functionsMeta = () => ({
  buysAnApple: { pikkuFuncId: 'buysAnApple', scenarioStepBrowser: true },
  checksOut: {
    pikkuFuncId: 'checksOut',
    description: 'ignored at the call site',
  },
  seesAReceipt: {
    pikkuFuncId: 'seesAReceipt',
    description: 'sees the receipt',
  },
})

describe('collectScenarioStepProse', () => {
  test('walks nested steps and prefers the call-site description', () => {
    const prose = collectScenarioStepProse(
      workflowMeta() as any,
      functionsMeta() as any
    )

    assert.equal(
      prose.byStepName.get('buys an apple')?.description,
      'buys an apple'
    )
    assert.equal(prose.byStepName.get('buys an apple')?.phase, 'given')
    assert.equal(prose.byStepName.get('buys an apple')?.actor, 'shopper')
    assert.equal(
      prose.byStepName.get('checks out')?.description,
      'completes the checkout',
      'the call site wins over the step declaration'
    )
    assert.equal(
      prose.byStepName.get('sees a receipt')?.description,
      'sees the receipt',
      'a nested step is still found, and falls back to the declared description'
    )
    assert.equal(
      prose.byStepName.has('seeds data'),
      false,
      'rpc steps are not scenario steps'
    )
  })
})

describe('scenarioBrowserSteps', () => {
  test('names the steps that need a browser', () => {
    assert.deepEqual(
      scenarioBrowserSteps(workflowMeta() as any, functionsMeta() as any),
      ['buysAnApple']
    )
  })

  test('a scenario with no browser steps needs no provider', () => {
    assert.deepEqual(
      scenarioBrowserSteps({ steps: [] } as any, functionsMeta() as any),
      []
    )
  })
})

describe('buildStepLadder', () => {
  const prose = () =>
    collectScenarioStepProse(workflowMeta() as any, functionsMeta() as any)

  test('renders prose, outcome and duration per step', () => {
    const lines = buildStepLadder(
      [
        { stepName: 'buys an apple', status: 'succeeded', durationMs: 412 },
        { stepName: 'checks out', status: 'succeeded', durationMs: 1200 },
        {
          stepName: 'sees a receipt',
          status: 'failed',
          durationMs: 30,
          error: 'expected 1 item, got 0',
        },
      ],
      prose()
    )

    assert.equal(lines.length, 3)
    assert.match(
      lines[0]!,
      /^ {2}Given the shopper buys an apple {2,}✓ {2}412ms$/
    )
    assert.match(
      lines[1]!,
      /^ {2}When {2}the shopper completes the checkout {2,}✓ {2}1\.2s$/
    )
    assert.match(
      lines[2]!,
      /^ {2}Then {2}the shopper sees the receipt {2,}✗ {2}expected 1 item, got 0$/
    )

    const columns = new Set(lines.map((line) => line.search(/[✓✗]/)))
    assert.equal(columns.size, 1, 'outcomes line up in one column')
  })

  test('a repeated step keeps its prose under the #ordinal key', () => {
    const lines = buildStepLadder(
      [
        { stepName: 'checks out', status: 'succeeded', durationMs: 10 },
        { stepName: 'checks out#1', status: 'succeeded', durationMs: 20 },
      ],
      prose()
    )

    assert.equal(lines.length, 2)
    assert.match(lines[1]!, /When {2}the shopper completes the checkout/)
  })

  test('a step with no recorded prose still appears, by its name', () => {
    const lines = buildStepLadder(
      [
        { stepName: 'buys an apple', status: 'succeeded', durationMs: 5 },
        { stepName: 'seeds data', status: 'succeeded', durationMs: 5 },
      ],
      prose()
    )
    assert.match(lines[1]!, /^ {8}seeds data {2,}✓ {2}5ms$/)
    assert.equal(
      lines[0]!.search(/[✓✗]/),
      lines[1]!.search(/[✓✗]/),
      'an un-prosed step still aligns with the ladder'
    )
  })

  test('a run with no steps renders nothing', () => {
    assert.deepEqual(buildStepLadder([], prose()), [])
  })
})

describe('step templates', () => {
  const templatedMeta = () => ({
    ...functionsMeta(),
    seesAReceipt: {
      pikkuFuncId: 'seesAReceipt',
      description: 'sees the receipt',
      scenarioStepTemplate: 'sees a receipt for {item}',
    },
    checksOut: {
      pikkuFuncId: 'checksOut',
      description: 'ignored at the call site',
      scenarioStepTemplate: 'pays with {method}',
    },
  })

  const templatedProse = () =>
    collectScenarioStepProse(workflowMeta() as any, templatedMeta() as any)

  test('the ladder names the values the step was called with', () => {
    const lines = buildStepLadder(
      [
        {
          stepName: 'sees a receipt',
          status: 'succeeded',
          durationMs: 4,
          input: { item: 'an apple' },
        },
      ],
      templatedProse()
    )

    assert.match(lines[0]!, /Then {2}the shopper sees a receipt for an apple/)
  })

  test('the same step reads differently for each input it is called with', () => {
    const lines = buildStepLadder(
      [
        {
          stepName: 'sees a receipt',
          status: 'succeeded',
          input: { item: 'an apple' },
        },
        {
          stepName: 'sees a receipt#1',
          status: 'succeeded',
          input: { item: 'a pear' },
        },
      ],
      templatedProse()
    )

    assert.match(lines[0]!, /sees a receipt for an apple/)
    assert.match(
      lines[1]!,
      /sees a receipt for a pear/,
      'a repeated step resolves its prose from the bare name but its own input'
    )
  })

  test('a call-site description still overrides the template', () => {
    const lines = buildStepLadder(
      [
        {
          stepName: 'checks out',
          status: 'succeeded',
          input: { method: 'card' },
        },
      ],
      templatedProse()
    )

    assert.match(
      lines[0]!,
      /When {2}the shopper completes the checkout$|When {2}the shopper completes the checkout {2}/
    )
  })

  test('a step whose name was built at runtime resolves prose by its function', () => {
    // What a loop produces: the declaration is `sees ${packageName}`, the run
    // records `sees an apple`, and the two can only be joined by step function.
    const loopMeta = {
      steps: [
        {
          type: 'scenarioStep',
          stepName: 'sees ${item}',
          stepFunc: 'seesAReceipt',
          phase: 'then',
          actor: 'shopper',
        },
      ],
    }
    const lines = buildStepLadder(
      [
        {
          stepName: 'sees an apple',
          status: 'succeeded',
          durationMs: 2,
          stepFunc: 'seesAReceipt',
          input: { item: 'an apple' },
        },
        {
          stepName: 'sees a pear',
          status: 'succeeded',
          durationMs: 2,
          stepFunc: 'seesAReceipt',
          input: { item: 'a pear' },
        },
      ],
      collectScenarioStepProse(loopMeta as any, templatedMeta() as any)
    )

    assert.match(lines[0]!, /Then {2}the shopper sees a receipt for an apple/)
    assert.match(lines[1]!, /Then {2}the shopper sees a receipt for a pear/)
  })

  test('the step name still wins over the function fallback', () => {
    const lines = buildStepLadder(
      [
        {
          stepName: 'checks out',
          status: 'succeeded',
          stepFunc: 'seesAReceipt',
          input: { item: 'an apple' },
        },
      ],
      templatedProse()
    )

    assert.match(
      lines[0]!,
      /When {2}the shopper completes the checkout/,
      'a step recorded under a declared name is never re-resolved by function'
    )
  })

  test('a function used at two call sites with different prose is not guessed at', () => {
    const ambiguousMeta = {
      steps: [
        {
          type: 'scenarioStep',
          stepName: 'sees ${item}',
          stepFunc: 'seesAReceipt',
          phase: 'then',
          actor: 'shopper',
        },
        {
          type: 'scenarioStep',
          stepName: 'the clerk sees ${item}',
          stepFunc: 'seesAReceipt',
          phase: 'then',
          actor: 'clerk',
        },
      ],
    }
    const lines = buildStepLadder(
      [
        {
          stepName: 'sees an apple',
          status: 'succeeded',
          stepFunc: 'seesAReceipt',
        },
      ],
      collectScenarioStepProse(ambiguousMeta as any, templatedMeta() as any)
    )

    assert.match(
      lines[0]!,
      /^ {8}sees an apple {2,}✓/,
      'two actors for one function means the ladder cannot know which ran'
    )
  })

  test('a step with no template still renders its description', () => {
    const lines = buildStepLadder(
      [
        {
          stepName: 'buys an apple',
          status: 'succeeded',
          input: { qty: 2 },
        },
      ],
      templatedProse()
    )

    assert.match(lines[0]!, /Given the shopper buys an apple/)
  })
})
