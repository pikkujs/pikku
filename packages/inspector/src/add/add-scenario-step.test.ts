import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { InspectorLogger } from '../types.js'
import type { ScenarioStepMeta, WorkflowStepMeta } from '@pikku/core/workflow'

function makeLogger(
  criticals: Array<{ code: string; message: string }>
): InspectorLogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: ({ code, message }: any) => {
      criticals.push({ code, message })
    },
    critical: (code: any, message: string) => {
      criticals.push({ code, message })
    },
    hasCriticalErrors: () => criticals.length > 0,
  } as InspectorLogger
}

const STEPS = [
  "import { pikkuScenarioStep } from '@pikku/core'",
  'export const buysAnApple = pikkuScenarioStep({',
  "  name: 'buysAnApple',",
  "  description: 'buys an apple',",
  '  browser: async ({ logger }, data: { qty: number }) => ({ ok: data.qty > 0 }),',
  '  default: async ({ logger }, data: { qty: number }) => ({ ok: data.qty > 0 }),',
  '})',
  'export const seesAReceipt = pikkuScenarioStep({',
  "  name: 'seesAReceipt',",
  "  description: 'sees a receipt',",
  '  default: async ({ logger }) => ({ ok: true }),',
  '})',
].join('\n')

const scenarioSource = (body: string[], preamble: string[] = []) =>
  [
    "import { pikkuScenario } from '@pikku/core/workflow'",
    'declare const actors: Record<string, any>',
    ...preamble,
    'export const shopFlow = pikkuScenario(async (_services, _input, { scenario }: any) => {',
    ...body.map((line) => `  ${line}`),
    '  return { ok: true }',
    '})',
  ].join('\n')

async function run(body: string[], preamble: string[] = []) {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-scenario-step-'))
  const stepsFile = join(rootDir, 'shop.steps.ts')
  const scenarioFile = join(rootDir, 'shop.scenario.ts')
  await writeFile(stepsFile, STEPS)
  await writeFile(scenarioFile, scenarioSource(body, preamble))
  const criticals: Array<{ code: string; message: string }> = []
  const state = await inspect(
    makeLogger(criticals),
    [stepsFile, scenarioFile],
    {
      rootDir,
    }
  )
  return {
    state,
    criticals,
    cleanup: () => rm(rootDir, { recursive: true, force: true }),
  }
}

const flatten = (steps: WorkflowStepMeta[]): WorkflowStepMeta[] =>
  steps.flatMap((step) => [
    step,
    ...('body' in step && step.body
      ? flatten(step.body as WorkflowStepMeta[])
      : []),
  ])

const scenarioSteps = (state: any): ScenarioStepMeta[] =>
  flatten(state.workflows.meta.shopFlow?.steps ?? []).filter(
    (step): step is ScenarioStepMeta => step.type === 'scenarioStep'
  )

describe('pikkuScenarioStep', () => {
  test('a step is registered under its declared name, not its export name', async () => {
    const { state, cleanup } = await run([
      "await scenario.given('buys an apple', 'buysAnApple', { qty: 1 }, { actor: actors.shopper })",
    ])
    try {
      assert.ok(
        state.functions.meta['buysAnApple'],
        `expected a function registered as 'buysAnApple', got: ${Object.keys(state.functions.meta).join(', ')}`
      )
    } finally {
      await cleanup()
    }
  })

  test('a step is never registered as an RPC — a browser step must not be network-callable', async () => {
    const { state, cleanup } = await run([
      "await scenario.given('buys an apple', 'buysAnApple', { qty: 1 }, { actor: actors.shopper })",
    ])
    try {
      assert.equal(
        state.rpc.internalMeta['buysAnApple'],
        undefined,
        'scenario steps must not be RPC-callable'
      )
      assert.equal(
        state.rpc.exposedMeta['buysAnApple'],
        undefined,
        'scenario steps must not be exposed over RPC'
      )
    } finally {
      await cleanup()
    }
  })

  test('given/when/then record phase, target and actor', async () => {
    const { state, cleanup } = await run([
      "await scenario.given('buys an apple', 'buysAnApple', { qty: 1 }, { actor: actors.shopper })",
      "await scenario.then('sees a receipt', 'seesAReceipt', {}, { actor: actors.shopper })",
    ])
    try {
      const steps = scenarioSteps(state)
      assert.equal(
        steps.length,
        2,
        `expected 2 scenario steps, got ${steps.length}`
      )
      assert.equal(steps[0]!.phase, 'given')
      assert.equal(steps[0]!.stepFunc, 'buysAnApple')
      assert.equal(steps[0]!.actor, 'shopper')
      assert.equal(steps[1]!.phase, 'then')
      assert.equal(steps[1]!.stepFunc, 'seesAReceipt')
    } finally {
      await cleanup()
    }
  })

  test('the step target is bundled, so the step function is wired', async () => {
    const { state, cleanup } = await run([
      "await scenario.step('buys an apple', 'buysAnApple', { qty: 1 }, { actor: actors.shopper })",
    ])
    try {
      assert.ok(
        state.rpc.invokedFunctions.has('buysAnApple'),
        `expected 'buysAnApple' to be bundled, got: ${[...state.rpc.invokedFunctions].join(', ')}`
      )
    } finally {
      await cleanup()
    }
  })

  test('a step inside a for..of loop is extracted, not silently dropped', async () => {
    const { state, cleanup } = await run([
      'const quantities = [1, 2]',
      'for (const qty of quantities) {',
      "  await scenario.when('buys an apple', 'buysAnApple', { qty }, { actor: actors.shopper })",
      '}',
    ])
    try {
      const steps = scenarioSteps(state)
      assert.equal(
        steps.length,
        1,
        `expected the looped step to appear in the fanout body, got ${steps.length} scenario steps`
      )
      assert.equal(steps[0]!.stepFunc, 'buysAnApple')
      assert.ok(
        state.rpc.invokedFunctions.has('buysAnApple'),
        'a looped step must still be bundled'
      )
    } finally {
      await cleanup()
    }
  })

  test('a non-literal step target is a PKU678 critical', async () => {
    const { criticals, cleanup } = await run([
      'const target = Math.random() > 0.5 ? "buysAnApple" : "seesAReceipt"',
      "await scenario.step('buys something', target as any, {}, { actor: actors.shopper })",
    ])
    try {
      assert.ok(
        criticals.find((c) => c.code === 'PKU678'),
        `expected a PKU678 critical for a dynamic step target, got: ${JSON.stringify(criticals)}`
      )
    } finally {
      await cleanup()
    }
  })

  test('a browser step called without an actor is a PKU677 critical', async () => {
    const { criticals, cleanup } = await run([
      "await scenario.given('buys an apple', 'buysAnApple', { qty: 1 })",
    ])
    try {
      assert.ok(
        criticals.find((c) => c.code === 'PKU677'),
        `expected a PKU677 critical for a browser step without an actor, got: ${JSON.stringify(criticals)}`
      )
    } finally {
      await cleanup()
    }
  })

  test('a scenario that never asserts is a PKU680 critical', async () => {
    const { criticals, cleanup } = await run([
      "await scenario.given('buys an apple', 'buysAnApple', { qty: 1 }, { actor: actors.shopper })",
      "await scenario.when('buys an apple', 'buysAnApple', { qty: 2 }, { actor: actors.shopper })",
    ])
    try {
      assert.ok(
        criticals.find((c) => c.code === 'PKU680'),
        `a flow with no 'then' proves only that nothing threw, and contributes 0/0 to witness coverage, got: ${JSON.stringify(criticals)}`
      )
    } finally {
      await cleanup()
    }
  })

  test('a scenario whose witness is an expectation helper is not flagged', async () => {
    // `expectService` is an inline step and carries no phase, so it reaches
    // PKU680 as nothing at all — but a recorded service call is a witness, and
    // a flow that has one is not the assertion-free flow the rule is for.
    const { criticals, cleanup } = await run([
      "await scenario.given('buys an apple', 'buysAnApple', { qty: 1 }, { actor: actors.shopper })",
      "await scenario.expectService('the receipt was emailed', 'emailService.send', { actor: actors.shopper })",
    ])
    try {
      assert.equal(
        criticals.filter((c) => c.code === 'PKU680').length,
        0,
        `got: ${JSON.stringify(criticals)}`
      )
    } finally {
      await cleanup()
    }
  })

  test('a scenario with an assertion is not flagged', async () => {
    const { criticals, cleanup } = await run([
      "await scenario.given('buys an apple', 'buysAnApple', { qty: 1 }, { actor: actors.shopper })",
      "await scenario.then('sees a receipt', 'seesAReceipt', {}, { actor: actors.shopper })",
    ])
    try {
      assert.equal(
        criticals.filter((c) => c.code === 'PKU680').length,
        0,
        `got: ${JSON.stringify(criticals)}`
      )
    } finally {
      await cleanup()
    }
  })

  test('a scenario driving only rpc steps is not flagged — it has no step ladder to assert on', async () => {
    const { criticals, cleanup } = await run([
      "await scenario.do('reads the order', 'orderGet', { orderId: 'o1' })",
    ])
    try {
      assert.equal(
        criticals.filter((c) => c.code === 'PKU680').length,
        0,
        `the rule is about scenarios written as given/when/then, got: ${JSON.stringify(criticals)}`
      )
    } finally {
      await cleanup()
    }
  })

  test('a non-browser step without an actor is allowed', async () => {
    const { criticals, cleanup } = await run([
      "await scenario.given('sees a receipt', 'seesAReceipt', {})",
    ])
    try {
      assert.equal(
        criticals.filter((c) => c.code === 'PKU677').length,
        0,
        `setup steps need no actor, got: ${JSON.stringify(criticals)}`
      )
    } finally {
      await cleanup()
    }
  })

  test('a step is marked as a step RPC in its function meta', async () => {
    const { state, cleanup } = await run([
      "await scenario.given('buys an apple', 'buysAnApple', { qty: 1 }, { actor: actors.shopper })",
    ])
    try {
      // The fourth RPC kind, alongside public/private/remote: a name that is
      // dispatched inside a run and refused everywhere else.
      assert.equal(state.functions.meta['buysAnApple']?.scenarioStep, true)
      assert.equal(state.functions.meta['seesAReceipt']?.scenarioStep, true)
    } finally {
      await cleanup()
    }
  })

  test('an ordinary function is not a step RPC', async () => {
    const { state, cleanup } = await run([
      "await scenario.given('buys an apple', 'buysAnApple', { qty: 1 }, { actor: actors.shopper })",
    ])
    try {
      assert.equal(state.functions.meta['shopFlow']?.scenarioStep, undefined)
    } finally {
      await cleanup()
    }
  })

  test('a closure in the scenario body does not have its statements whitelisted', async () => {
    const { state, cleanup } = await run([
      'const safely = async (fn: any) => { try { return await fn() } catch { return null } }',
      'void safely',
      "await scenario.given('buys an apple', 'buysAnApple', { qty: 1 }, { actor: actors.shopper })",
    ])
    try {
      const steps = scenarioSteps(state)
      assert.equal(
        steps.length,
        1,
        `a try/catch inside a closure must not drop the scenario's steps, got ${steps.length}`
      )
      assert.equal(steps[0]!.stepFunc, 'buysAnApple')
    } finally {
      await cleanup()
    }
  })

  test('destructuring a step result is reported, not silently dropped', async () => {
    const { state, criticals, cleanup } = await run([
      "const { ok } = await scenario.given('sees a receipt', 'seesAReceipt', {})",
      'void ok',
    ])
    try {
      const steps = scenarioSteps(state)
      assert.equal(
        steps.length,
        0,
        'the DSL does not model a destructured step result'
      )
      assert.ok(
        criticals.find((c) => c.code === 'PKU679'),
        `a step the DSL cannot model must be loud, got: ${JSON.stringify(criticals)}`
      )
    } finally {
      await cleanup()
    }
  })

  test('a module-level constant used as step input is inlined, not read off the trigger', async () => {
    const { state, cleanup } = await run(
      [
        "await scenario.given('buys an apple', 'buysAnApple', { qty: QTY }, { actor: actors.shopper })",
      ],
      ['const QTY = 3']
    )
    try {
      const steps = scenarioSteps(state)
      assert.equal(steps.length, 1)
      assert.deepEqual(
        steps[0]!.inputs?.qty,
        { from: 'literal', value: 3 },
        `a constant declared outside the scenario is not a trigger field, got: ${JSON.stringify(steps[0]!.inputs)}`
      )
    } finally {
      await cleanup()
    }
  })
})
