import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  collectScenarioStepProse,
  scenarioBrowserSteps,
  scenarioFailureFromSteps,
  scenarioStepRows,
  scenarioStepsWithoutBinding,
  scenarioSurfaceCoverage,
} from './scenario-ladder.js'
import { buildStepLadder } from './scenario-formatter.js'
import type { ScenarioProse, ScenarioStepOutcome } from './scenario-ladder.js'

/** What a reader sees: the run joined to its prose, then laid out. */
const ladder = (steps: ScenarioStepOutcome[], prose: ScenarioProse) =>
  buildStepLadder(scenarioStepRows(steps, prose))

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
  buysAnApple: {
    pikkuFuncId: 'buysAnApple',
    scenarioStepSurfaces: ['browser', 'default'],
  },
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

describe('scenarioStepsWithoutBinding', () => {
  test('an action with neither the run surface nor a default cannot run', () => {
    // `buysAnApple` binds browser + default, so it falls back; `checksOut`
    // declares nothing at all, which reads as default-only.
    assert.deepEqual(
      scenarioStepsWithoutBinding(
        workflowMeta() as any,
        functionsMeta() as any,
        'cli'
      ),
      []
    )

    const cliOnly = {
      ...functionsMeta(),
      checksOut: { pikkuFuncId: 'checksOut', scenarioStepSurfaces: ['cli'] },
    }
    assert.deepEqual(
      scenarioStepsWithoutBinding(
        workflowMeta() as any,
        cliOnly as any,
        'browser'
      ),
      ['checksOut']
    )
  })

  test('an assertion that can run nowhere holds the flow back too', () => {
    const browserOnlyThen = {
      ...functionsMeta(),
      seesAReceipt: {
        pikkuFuncId: 'seesAReceipt',
        scenarioStepSurfaces: ['browser'],
      },
    }
    assert.deepEqual(
      scenarioStepsWithoutBinding(
        workflowMeta() as any,
        browserOnlyThen as any,
        'cli'
      ),
      ['seesAReceipt'],
      'an assertion nothing can check would report a pass it never earned — skip the flow, do not run it'
    )
  })

  test('an assertion that runs, just not on the run surface, is a coverage gap not a blocker', () => {
    assert.deepEqual(
      scenarioStepsWithoutBinding(
        workflowMeta() as any,
        functionsMeta() as any,
        'browser'
      ),
      [],
      'seesAReceipt has a default witness, so the flow still runs and the gap is reported'
    )
  })
})

describe('scenarioSurfaceCoverage', () => {
  test('every step counts, so a step that fell back to the server drags the ratio down', () => {
    // `buysAnApple` is bound to the browser; `checksOut` and `seesAReceipt` are
    // not, so they run server-side. That is 1 of 3 — no annotation needed, the
    // denominator says it.
    const coverage = scenarioSurfaceCoverage(
      workflowMeta() as any,
      functionsMeta() as any,
      'browser'
    )
    assert.equal(coverage.total, 3)
    assert.equal(coverage.onSurface, 1)
  })

  test('an action that fell back is counted but not called unwitnessed', () => {
    const coverage = scenarioSurfaceCoverage(
      workflowMeta() as any,
      functionsMeta() as any,
      'browser'
    )
    assert.deepEqual(
      coverage.unwitnessed,
      ['seesAReceipt'],
      'only a `then` claims the actor observed something, so only a `then` can be a false sentence'
    )
  })

  test('a fully browser-bound ladder is 100%', () => {
    const allInBrowser = Object.fromEntries(
      Object.entries(functionsMeta()).map(([name, meta]) => [
        name,
        { ...meta, scenarioStepSurfaces: ['browser', 'default'] },
      ])
    )
    const coverage = scenarioSurfaceCoverage(
      workflowMeta() as any,
      allInBrowser as any,
      'browser'
    )
    assert.equal(coverage.onSurface, coverage.total)
    assert.deepEqual(coverage.unwitnessed, [])
  })

  test('a default run covers everything — default is the floor, nothing can miss it', () => {
    const coverage = scenarioSurfaceCoverage(
      workflowMeta() as any,
      functionsMeta() as any,
      'default'
    )
    assert.equal(coverage.onSurface, coverage.total)
    assert.deepEqual(coverage.unwitnessed, [])
  })

  test('a step that runs nowhere is not credited to the run that refuses it', () => {
    const browserOnlyThen = {
      ...functionsMeta(),
      seesAReceipt: {
        pikkuFuncId: 'seesAReceipt',
        scenarioStepSurfaces: ['browser'],
      },
    }
    const coverage = scenarioSurfaceCoverage(
      workflowMeta() as any,
      browserOnlyThen as any,
      'default'
    )
    assert.equal(
      coverage.total,
      2,
      'a default run cannot execute a browser-only step, so it is not a statistic about that run'
    )
    assert.equal(coverage.onSurface, 2)
  })
})

describe('buildStepLadder', () => {
  const prose = () =>
    collectScenarioStepProse(workflowMeta() as any, functionsMeta() as any)

  test('renders prose, outcome and duration per step', () => {
    const lines = ladder(
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
    const lines = ladder(
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
    const lines = ladder(
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
    assert.deepEqual(ladder([], prose()), [])
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
    const lines = ladder(
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
    const lines = ladder(
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
    const lines = ladder(
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
    const lines = ladder(
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
    const lines = ladder(
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
    const lines = ladder(
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
    const lines = ladder(
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

describe('scenarioFailureFromSteps', () => {
  const failingSteps = () => [
    { stepName: 'buys an apple', status: 'succeeded', durationMs: 4 },
    {
      stepName: 'checks out',
      status: 'failed',
      error: 'Timed out waiting for selector button[title="Edit"]',
      stack:
        'Error: Timed out waiting for selector button[title="Edit"]\n' +
        '    at checksOut (/project/src/scenarios/checkout.steps.ts:71:5)\n' +
        '    at Runner.step (/project/node_modules/@pikku/core/dist/run.js:12:9)',
    },
  ]

  test('the failing step is joined back to the prose that declared it', () => {
    const failure = scenarioFailureFromSteps(
      failingSteps() as any,
      collectScenarioStepProse(workflowMeta() as any, functionsMeta() as any)
    )

    assert.match(failure!.sentence!, /completes the checkout/)
    assert.match(failure!.message, /Timed out waiting for selector/)
  })

  test('a run where every step passed has no step failure to report', () => {
    const failure = scenarioFailureFromSteps(
      [{ stepName: 'buys an apple', status: 'succeeded' }] as any,
      collectScenarioStepProse(workflowMeta() as any, functionsMeta() as any)
    )

    assert.equal(failure, undefined)
  })
})
