import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import {
  aggregateRequiredServices,
  validateSecretOverrides,
  validateCredentialOverrides,
  validateVariableOverrides,
} from './post-process.js'
import type { InspectorState, InspectorLogger } from '../types.js'

const makeCriticalLogger = () => {
  const criticals: { code: string; message: string }[] = []
  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    critical: (code: any, message: string) =>
      criticals.push({ code: String(code), message }),
    diagnostic: () => {},
  } as unknown as InspectorLogger
  return { logger, criticals }
}

const makeOverrideState = (
  kind: 'secrets' | 'credentials' | 'variables',
  declaredNames: string[],
  overrides: Record<string, string>,
  overrideKey: 'secretOverrides' | 'credentialOverrides' | 'variableOverrides'
): Omit<InspectorState, 'typesLookup'> =>
  ({
    rpc: {
      wireAddonDeclarations: new Map([
        [
          'slack-marketing',
          { package: '@addon/slack', [overrideKey]: overrides },
        ],
      ]),
    },
    secrets: {
      definitions:
        kind === 'secrets' ? declaredNames.map((name) => ({ name })) : [],
    },
    credentials: {
      definitions:
        kind === 'credentials' ? declaredNames.map((name) => ({ name })) : [],
    },
    variables: {
      definitions:
        kind === 'variables' ? declaredNames.map((name) => ({ name })) : [],
    },
  }) as unknown as Omit<InspectorState, 'typesLookup'>

function makeState(
  overrides: {
    usedFunctions?: string[]
    functionsMeta?: Record<string, any>
    addonFunctions?: Record<string, Record<string, any>>
    addonRequiredParentServices?: string[]
  } = {}
): Omit<InspectorState, 'typesLookup'> {
  return {
    serviceAggregation: {
      requiredServices: new Set<string>(),
      usedFunctions: new Set(overrides.usedFunctions ?? []),
      usedMiddleware: new Set<string>(),
      usedPermissions: new Set<string>(),
      allSingletonServices: [],
      allWireServices: [],
    },
    functions: { meta: overrides.functionsMeta ?? {} },
    middleware: { definitions: {}, tagMiddleware: new Map() },
    permissions: { definitions: {} },
    http: {
      meta: {
        get: {},
        post: {},
        put: {},
        patch: {},
        delete: {},
        head: {},
        options: {},
      },
      routeMiddleware: new Map(),
    },
    channels: { meta: {} },
    queueWorkers: { meta: {} },
    scheduledTasks: { meta: {} },
    mcpEndpoints: { toolsMeta: {}, promptsMeta: {}, resourcesMeta: {} },
    agents: { agentsMeta: {} },
    workflows: { meta: {}, graphMeta: {} },
    wireServicesMeta: new Map(),
    rpc: { internalMeta: {}, exposedMeta: {} },
    addonFunctions: overrides.addonFunctions ?? {},
    addonRequiredParentServices: overrides.addonRequiredParentServices ?? [],
  } as unknown as Omit<InspectorState, 'typesLookup'>
}

const CONSOLE_PARENT_SERVICES = [
  'metaService',
  'aiAgentRunner',
  'deploymentService',
  'credentialService',
]

describe('aggregateRequiredServices — per-function addon services', () => {
  test('a used addon function adds only its own parent services', () => {
    const state = makeState({
      usedFunctions: ['console:getSchema'],
      addonFunctions: {
        console: {
          getSchema: {
            services: { optimized: true, services: ['metaService'] },
          },
          runAgent: {
            services: {
              optimized: true,
              services: ['aiAgentRunner', 'deploymentService'],
            },
          },
        },
      },
      addonRequiredParentServices: CONSOLE_PARENT_SERVICES,
    })
    aggregateRequiredServices(state)
    const required = state.serviceAggregation.requiredServices
    assert.ok(required.has('metaService'))
    assert.ok(!required.has('aiAgentRunner'))
    assert.ok(!required.has('deploymentService'))
    assert.ok(!required.has('credentialService'))
  })

  test('an addon-created service falls back to the full parent blanket', () => {
    const state = makeState({
      usedFunctions: ['console:editCode'],
      addonFunctions: {
        console: {
          editCode: {
            services: {
              optimized: true,
              services: ['codeEditService', 'metaService'],
            },
          },
        },
      },
      addonRequiredParentServices: CONSOLE_PARENT_SERVICES,
    })
    aggregateRequiredServices(state)
    const required = state.serviceAggregation.requiredServices
    for (const service of CONSOLE_PARENT_SERVICES) {
      assert.ok(required.has(service), `expected blanket to add ${service}`)
    }
  })

  test('missing services meta (old addon build) falls back to the blanket', () => {
    const state = makeState({
      usedFunctions: ['console:getSchema'],
      addonFunctions: { console: { getSchema: {} } },
      addonRequiredParentServices: CONSOLE_PARENT_SERVICES,
    })
    aggregateRequiredServices(state)
    const required = state.serviceAggregation.requiredServices
    for (const service of CONSOLE_PARENT_SERVICES) {
      assert.ok(required.has(service), `expected blanket to add ${service}`)
    }
  })

  test('a bare project function colliding with an addon function name adds nothing', () => {
    const state = makeState({
      usedFunctions: ['getAgentThreads'],
      functionsMeta: {
        getAgentThreads: {
          services: { optimized: true, services: ['kysely'] },
        },
      },
      addonFunctions: {
        console: {
          getAgentThreads: {
            services: { optimized: true, services: ['metaService'] },
          },
        },
      },
      addonRequiredParentServices: CONSOLE_PARENT_SERVICES,
    })
    aggregateRequiredServices(state)
    const required = state.serviceAggregation.requiredServices
    assert.ok(required.has('kysely'))
    assert.ok(!required.has('metaService'))
    assert.ok(!required.has('aiAgentRunner'))
  })

  test('no used addon functions adds no parent services', () => {
    const state = makeState({
      usedFunctions: ['listTasks'],
      functionsMeta: {
        listTasks: { services: { optimized: true, services: ['kysely'] } },
      },
      addonFunctions: {
        console: {
          getSchema: {
            services: { optimized: true, services: ['metaService'] },
          },
        },
      },
      addonRequiredParentServices: CONSOLE_PARENT_SERVICES,
    })
    aggregateRequiredServices(state)
    const required = state.serviceAggregation.requiredServices
    assert.ok(!required.has('metaService'))
    assert.ok(!required.has('aiAgentRunner'))
  })

  test('internal services in addon function meta never force the blanket', () => {
    const state = makeState({
      usedFunctions: ['console:getSchema'],
      addonFunctions: {
        console: {
          getSchema: {
            services: {
              optimized: true,
              services: ['metaService', 'rpc', 'channel'],
            },
          },
        },
      },
      addonRequiredParentServices: CONSOLE_PARENT_SERVICES,
    })
    aggregateRequiredServices(state)
    const required = state.serviceAggregation.requiredServices
    assert.ok(required.has('metaService'))
    assert.ok(!required.has('aiAgentRunner'))
    assert.ok(!required.has('rpc'))
  })

  test('default framework services in addon function meta never force the blanket', () => {
    const state = makeState({
      usedFunctions: ['ext:goodbye'],
      addonFunctions: {
        ext: {
          goodbye: {
            services: { optimized: true, services: ['logger', 'config'] },
          },
        },
      },
      addonRequiredParentServices: ['greetingStore', 'auditSink'],
    })
    aggregateRequiredServices(state)
    const required = state.serviceAggregation.requiredServices
    assert.ok(!required.has('greetingStore'))
    assert.ok(!required.has('auditSink'))
  })

  test('a ref()-wired route (inline id + namespaced target) aggregates the target services', () => {
    const state = makeState({
      usedFunctions: [
        'http:get:/workflow-run/stream',
        'console:streamWorkflowRun',
      ],
      functionsMeta: {
        'http:get:/workflow-run/stream': {
          services: { optimized: false, services: [] },
        },
      },
      addonFunctions: {
        console: {
          streamWorkflowRun: {
            services: { optimized: true, services: ['metaService'] },
          },
        },
      },
      addonRequiredParentServices: CONSOLE_PARENT_SERVICES,
    })
    aggregateRequiredServices(state)
    const required = state.serviceAggregation.requiredServices
    assert.ok(required.has('metaService'))
    assert.ok(!required.has('aiAgentRunner'))
  })

  test('multiple used addon functions union their parent services', () => {
    const state = makeState({
      usedFunctions: ['console:getSchema', 'console:runAgent'],
      addonFunctions: {
        console: {
          getSchema: {
            services: { optimized: true, services: ['metaService'] },
          },
          runAgent: {
            services: { optimized: true, services: ['aiAgentRunner'] },
          },
        },
      },
      addonRequiredParentServices: CONSOLE_PARENT_SERVICES,
    })
    aggregateRequiredServices(state)
    const required = state.serviceAggregation.requiredServices
    assert.ok(required.has('metaService'))
    assert.ok(required.has('aiAgentRunner'))
    assert.ok(!required.has('deploymentService'))
    assert.ok(!required.has('credentialService'))
  })
})

describe('override validation resolves the override target (value), not the logical key', () => {
  test('validateSecretOverrides accepts an override whose value is a declared secret', () => {
    const { logger, criticals } = makeCriticalLogger()
    const state = makeOverrideState(
      'secrets',
      ['slack_marketing_secret'],
      { slack: 'slack_marketing_secret' },
      'secretOverrides'
    )
    validateSecretOverrides(logger, state)
    assert.deepEqual(criticals, [])
  })

  test('validateSecretOverrides flags an override whose value is not declared', () => {
    const { logger, criticals } = makeCriticalLogger()
    const state = makeOverrideState(
      'secrets',
      ['slack_marketing_secret'],
      { slack: 'ghost_secret' },
      'secretOverrides'
    )
    validateSecretOverrides(logger, state)
    assert.equal(criticals.length, 1)
    assert.match(criticals[0]!.message, /ghost_secret/)
  })

  test('validateCredentialOverrides accepts an override whose value is a declared credential', () => {
    const { logger, criticals } = makeCriticalLogger()
    const state = makeOverrideState(
      'credentials',
      ['marketing_cred'],
      { slack: 'marketing_cred' },
      'credentialOverrides'
    )
    validateCredentialOverrides(logger, state)
    assert.deepEqual(criticals, [])
  })

  test('validateVariableOverrides accepts an override whose value is a declared variable', () => {
    const { logger, criticals } = makeCriticalLogger()
    const state = makeOverrideState(
      'variables',
      ['marketing_region'],
      { region: 'marketing_region' },
      'variableOverrides'
    )
    validateVariableOverrides(logger, state)
    assert.deepEqual(criticals, [])
  })
})
