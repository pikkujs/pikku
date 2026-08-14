import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { TypesMap } from '@pikku/inspector'
import type { FunctionsMeta } from '@pikku/core/ecosystem/services'
import { serializeScenarioStepMap } from './serialize-scenario-step-map.js'

/**
 * The map only ever asks the types map to resolve a name; unknown names fall
 * back to the name itself, which is exactly what a bare project state does.
 */
const emptyTypesMap = () =>
  ({
    getTypeMeta: (name: string) => ({ uniqueName: name }),
    customTypes: new Map(),
    getTypeMetaOrUndefined: () => undefined,
  }) as unknown as TypesMap

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as any

const functionsMeta = (): FunctionsMeta =>
  ({
    buysAnApple: {
      pikkuFuncId: 'buysAnApple',
      funcWrapper: 'pikkuScenarioStep',
      name: 'buysAnApple',
      inputs: ['BuysAnAppleInput'],
      outputs: ['BuysAnAppleOutput'],
      scenarioStepSurfaces: ['browser', 'default'],
    },
    seesAReceipt: {
      pikkuFuncId: 'seesAReceipt',
      funcWrapper: 'pikkuScenarioStep',
      name: 'seesAReceipt',
      inputs: null,
      outputs: ['ReceiptOutput'],
    },
    trialHasExpired: {
      pikkuFuncId: 'trialHasExpired',
      funcWrapper: 'pikkuPlatformScenarioStep',
      name: 'trialHasExpired',
      inputs: ['TrialInput'],
      outputs: null,
      scenarioStepKind: 'platform',
      scenarioStepSurfaces: ['default'],
    },
    stripeWebhookArrives: {
      pikkuFuncId: 'stripeWebhookArrives',
      funcWrapper: 'pikkuAddonScenarioStep',
      name: 'stripeWebhookArrives',
      inputs: ['WebhookInput'],
      outputs: null,
      scenarioStepKind: 'addon',
      scenarioStepAddon: 'stripe',
      scenarioStepSurfaces: ['default'],
    },
    createTodo: {
      pikkuFuncId: 'createTodo',
      funcWrapper: 'pikkuSessionlessFunc',
      name: 'createTodo',
      inputs: ['CreateTodoInput'],
      outputs: ['Todo'],
    },
  }) as unknown as FunctionsMeta

const emit = (meta = functionsMeta()) =>
  serializeScenarioStepMap(logger, '.pikku', {}, emptyTypesMap(), meta)

describe('serializeScenarioStepMap', () => {
  test('every declared step becomes a key', () => {
    const result = emit()
    assert.match(result, /readonly 'buysAnApple': ScenarioStepHandler</)
    assert.match(result, /readonly 'seesAReceipt': ScenarioStepHandler</)
  })

  // Who acts changes what a step may do, not how a scenario references it — a
  // scenario calls "Stripe's webhook arrives" by name exactly as it calls
  // "buys an apple".
  test('a platform or addon step is a name a scenario can call too', () => {
    const result = emit()
    assert.match(result, /readonly 'trialHasExpired': ScenarioStepHandler</)
    assert.match(
      result,
      /readonly 'stripeWebhookArrives': ScenarioStepHandler</
    )
  })

  test('ordinary functions are not steps', () => {
    const result = emit()
    assert.doesNotMatch(
      result,
      /'createTodo'/,
      'only pikkuScenarioStep functions belong in the step map'
    )
  })

  test('a step with no input maps to void', () => {
    const result = emit()
    assert.match(result, /readonly 'seesAReceipt': ScenarioStepHandler<void, /)
  })

  test('the map is always exported, even with no steps', () => {
    const result = serializeScenarioStepMap(
      logger,
      '.pikku',
      {},
      emptyTypesMap(),
      {} as FunctionsMeta
    )
    assert.match(result, /export type FlattenedScenarioStepMap/)
  })
})
