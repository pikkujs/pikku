import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  aggregateRequiredServices,
  validateSecretOverrides,
  validateCredentialOverrides,
  validateVariableOverrides,
  validateRemoteAddonDependencies,
  validateRemoteAddonAuth,
  validateAgentToolReferences,
  validateAgentModels,
} from './post-process.js'
import { ErrorCode } from '../error-codes.js'
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

const makeGrantState = (
  kind: 'secrets' | 'credentials',
  declaredNames: string[],
  decl: {
    secretGrants?: string[]
    credentialGrants?: string[]
    secretOverrides?: Record<string, string>
    credentialOverrides?: Record<string, string>
  }
): Omit<InspectorState, 'typesLookup'> =>
  ({
    rpc: {
      wireAddonDeclarations: new Map([
        ['slack-marketing', { package: '@addon/slack', ...decl }],
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
    variables: { definitions: [] },
  }) as unknown as Omit<InspectorState, 'typesLookup'>

function makeState(
  overrides: {
    usedFunctions?: string[]
    functionsMeta?: Record<string, any>
    addonFunctions?: Record<string, Record<string, any>>
    addonRequiredParentServices?: string[]
    authServices?: string[]
    graphMeta?: Record<string, any>
    scopeDefinitions?: any[]
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
    workflows: { meta: {}, graphMeta: overrides.graphMeta ?? {} },
    wireServicesMeta: new Map(),
    rpc: { internalMeta: {}, exposedMeta: {} },
    scopes: { definitions: overrides.scopeDefinitions ?? [] },
    addonFunctions: overrides.addonFunctions ?? {},
    addonRequiredParentServices: overrides.addonRequiredParentServices ?? [],
    auth: overrides.authServices
      ? {
          definition: {
            services: { optimized: true, services: overrides.authServices },
          },
        }
      : {},
  } as unknown as Omit<InspectorState, 'typesLookup'>
}

const CONSOLE_PARENT_SERVICES = [
  'metaService',
  'agentRunner',
  'deploymentService',
  'credentialService',
]

describe('aggregateRequiredServices — synthetic workflow queue workers', () => {
  const graphMeta = {
    orderWorkflow: {
      name: 'orderWorkflow',
      source: 'dsl',
      nodes: { 'step-1': { rpcName: 'chargeCard' } },
    },
    loginScenario: {
      name: 'loginScenario',
      source: 'scenario',
      nodes: { 'step-1': { rpcName: 'opensPage' } },
    },
  }

  // A scenario IS a workflow, so it used to be handed an orchestrator queue
  // worker in the app's queue meta — which the app bootstrap registers and every
  // deployed bundle therefore carries, leaving a provider to create a production
  // queue named after a test. Nothing dispatches a scenario through a queue:
  // `pikku scenario run` executes its steps in-process.
  test('a scenario gets no orchestrator queue worker', () => {
    const state = makeState({ graphMeta })
    aggregateRequiredServices(state)
    assert.deepEqual(Object.keys(state.queueWorkers.meta), [
      'wf-orchestrator-order-workflow',
    ])
  })
})

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
              services: ['agentRunner', 'deploymentService'],
            },
          },
        },
      },
      addonRequiredParentServices: CONSOLE_PARENT_SERVICES,
    })
    aggregateRequiredServices(state)
    const required = state.serviceAggregation.requiredServices
    assert.ok(required.has('metaService'))
    assert.ok(!required.has('agentRunner'))
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
    assert.ok(!required.has('agentRunner'))
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
    assert.ok(!required.has('agentRunner'))
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
    assert.ok(!required.has('agentRunner'))
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
    assert.ok(!required.has('agentRunner'))
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
            services: { optimized: true, services: ['agentRunner'] },
          },
        },
      },
      addonRequiredParentServices: CONSOLE_PARENT_SERVICES,
    })
    aggregateRequiredServices(state)
    const required = state.serviceAggregation.requiredServices
    assert.ok(required.has('metaService'))
    assert.ok(required.has('agentRunner'))
    assert.ok(!required.has('deploymentService'))
    assert.ok(!required.has('credentialService'))
  })
})

describe('aggregateRequiredServices — the auth factory’s own services', () => {
  test('an auth definition contributes its services before its handler exists', () => {
    // The state a clean checkout produces: the project declares
    // `pikkuBetterAuth`, so the definition is inspected, but the handler the CLI
    // generates from it has not been written yet — so nothing in functions.meta
    // mentions the services `authorize` reads.
    const state = makeState({ authServices: ['kysely', 'jwt'] })
    aggregateRequiredServices(state)
    const required = state.serviceAggregation.requiredServices
    assert.ok(required.has('kysely'))
    assert.ok(required.has('jwt'))
  })

  test('a project without auth is unaffected', () => {
    const state = makeState()
    aggregateRequiredServices(state)
    assert.equal(state.serviceAggregation.requiredServices.size, 0)
  })
})

describe('aggregateRequiredServices — scopes imply the service that resolves them', () => {
  // Nothing in a project destructures `scopeService` — the generated auth layer
  // reaches it — so the declaration is the only signal there is. Without this,
  // `pikku db generate` would leave a project that declares scopes with no
  // tables to grant them in.
  test('a declared scope requires scopeService', () => {
    const state = makeState({ scopeDefinitions: [{ id: 'admin' }] })
    aggregateRequiredServices(state)
    assert.ok(state.serviceAggregation.requiredServices.has('scopeService'))
  })

  test('a project that declares none does not', () => {
    const state = makeState()
    aggregateRequiredServices(state)
    assert.ok(!state.serviceAggregation.requiredServices.has('scopeService'))
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

  test('validateSecretOverrides accepts a grant naming a declared secret', () => {
    const { logger, criticals } = makeCriticalLogger()
    const state = makeGrantState('secrets', ['STRIPE_KEY'], {
      secretGrants: ['STRIPE_KEY'],
    })
    validateSecretOverrides(logger, state)
    assert.deepEqual(criticals, [])
  })

  test('validateSecretOverrides flags a grant naming no declared secret', () => {
    const { logger, criticals } = makeCriticalLogger()
    const state = makeGrantState('secrets', ['STRIPE_KEY'], {
      secretGrants: ['STIRPE_KEY'],
    })
    validateSecretOverrides(logger, state)
    assert.equal(criticals.length, 1)
    assert.match(criticals[0]!.message, /STIRPE_KEY/)
    assert.match(criticals[0]!.message, /STRIPE_KEY/)
  })

  test('validateSecretOverrides resolves a grant through its override before looking it up', () => {
    const { logger, criticals } = makeCriticalLogger()
    const state = makeGrantState('secrets', ['PROD_EMAIL_KEY'], {
      secretGrants: ['MAILGUN_KEY'],
      secretOverrides: { MAILGUN_KEY: 'PROD_EMAIL_KEY' },
    })
    validateSecretOverrides(logger, state)
    assert.deepEqual(criticals, [])
  })

  test('validateCredentialOverrides flags a grant naming no declared credential', () => {
    const { logger, criticals } = makeCriticalLogger()
    const state = makeGrantState('credentials', ['marketing_cred'], {
      credentialGrants: ['ghost_cred'],
    })
    validateCredentialOverrides(logger, state)
    assert.equal(criticals.length, 1)
    assert.match(criticals[0]!.message, /ghost_cred/)
  })
})

const makeRemoteState = (
  rootDir: string,
  decl: {
    package: string
    remote?: boolean
    authCredentialId?: string
    authSecretId?: string
  },
  declared: { credentials?: string[]; secrets?: string[] } = {}
): Omit<InspectorState, 'typesLookup'> =>
  ({
    rootDir,
    rpc: {
      wireAddonDeclarations: new Map([['registry', decl]]),
    },
    credentials: {
      definitions: (declared.credentials ?? []).map((name) => ({ name })),
    },
    secrets: {
      definitions: (declared.secrets ?? []).map((name) => ({ name })),
    },
  }) as unknown as Omit<InspectorState, 'typesLookup'>

describe('validateRemoteAddonDependencies (wireRemoteAddon must be a devDependency)', () => {
  const writePkg = (
    deps: Record<string, string>,
    devDeps: Record<string, string>
  ): string => {
    const dir = mkdtempSync(join(tmpdir(), 'pikku-remote-dep-'))
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ dependencies: deps, devDependencies: devDeps })
    )
    return dir
  }

  test('passes when the remote addon is in devDependencies', () => {
    const { logger, criticals } = makeCriticalLogger()
    const dir = writePkg({}, { '@pikkufabric/addon-registry': '1.0.0' })
    try {
      validateRemoteAddonDependencies(
        logger,
        makeRemoteState(dir, {
          package: '@pikkufabric/addon-registry',
          remote: true,
        })
      )
      assert.deepEqual(criticals, [])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('errors when the remote addon is a production dependency', () => {
    const { logger, criticals } = makeCriticalLogger()
    const dir = writePkg({ '@pikkufabric/addon-registry': '1.0.0' }, {})
    try {
      validateRemoteAddonDependencies(
        logger,
        makeRemoteState(dir, {
          package: '@pikkufabric/addon-registry',
          remote: true,
        })
      )
      assert.equal(criticals.length, 1)
      assert.equal(
        criticals[0]!.code,
        ErrorCode.REMOTE_ADDON_NOT_DEV_DEPENDENCY
      )
      assert.match(criticals[0]!.message, /devDependencies/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('errors when the remote addon is missing from both', () => {
    const { logger, criticals } = makeCriticalLogger()
    const dir = writePkg({}, {})
    try {
      validateRemoteAddonDependencies(
        logger,
        makeRemoteState(dir, {
          package: '@pikkufabric/addon-registry',
          remote: true,
        })
      )
      assert.equal(criticals.length, 1)
      assert.equal(
        criticals[0]!.code,
        ErrorCode.REMOTE_ADDON_NOT_DEV_DEPENDENCY
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('a non-remote (wireAddon) declaration is judged on resolvability, not package.json', () => {
    // Being listed as a dependency is not what makes an addon usable — it is
    // discovered because it is wired, and it can arrive by workspace link or a
    // local addons/ directory without ever appearing here. So a declared but
    // absent package is still an error.
    const { logger, criticals } = makeCriticalLogger()
    const dir = writePkg({ '@addon/local': '1.0.0' }, {})
    try {
      validateRemoteAddonDependencies(
        logger,
        makeRemoteState(dir, { package: '@addon/local' })
      )
      assert.equal(criticals.length, 1)
      assert.equal(criticals[0]!.code, ErrorCode.ADDON_NOT_INSTALLED)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('a non-remote addon present only in node_modules passes', () => {
    // The inverse, and the case that matters: installed by link, absent from
    // package.json. Reported as missing, this would fail every project whose
    // addon lives in a local addons/ directory.
    const { logger, criticals } = makeCriticalLogger()
    const dir = writePkg({}, {})
    try {
      const pkgDir = join(dir, 'node_modules', '@addon', 'local')
      mkdirSync(pkgDir, { recursive: true })
      writeFileSync(
        join(pkgDir, 'package.json'),
        JSON.stringify({ name: '@addon/local', version: '1.0.0' })
      )
      validateRemoteAddonDependencies(
        logger,
        makeRemoteState(dir, { package: '@addon/local' })
      )
      assert.deepEqual(criticals, [])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('an exports map that refuses package.json is not read as missing', () => {
    // `require.resolve('<pkg>/package.json')` throws ERR_PACKAGE_PATH_NOT_EXPORTED
    // on a package with a restrictive exports map. Reaching the exports map
    // means the package was found, so that must not count as absent.
    const { logger, criticals } = makeCriticalLogger()
    const dir = writePkg({}, {})
    try {
      const pkgDir = join(dir, 'node_modules', '@addon', 'local')
      mkdirSync(pkgDir, { recursive: true })
      writeFileSync(
        join(pkgDir, 'package.json'),
        JSON.stringify({
          name: '@addon/local',
          version: '1.0.0',
          main: 'index.js',
          exports: { '.': './index.js' },
        })
      )
      writeFileSync(join(pkgDir, 'index.js'), 'module.exports = {}\n')
      validateRemoteAddonDependencies(
        logger,
        makeRemoteState(dir, { package: '@addon/local' })
      )
      assert.deepEqual(criticals, [])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('validateRemoteAddonAuth (bound credential/secret must exist)', () => {
  test('passes when the bound credential is wired', () => {
    const { logger, criticals } = makeCriticalLogger()
    validateRemoteAddonAuth(
      logger,
      makeRemoteState(
        '/tmp',
        {
          package: '@pikkufabric/addon-registry',
          remote: true,
          authCredentialId: 'fabricRegistryToken',
        },
        { credentials: ['fabricRegistryToken'] }
      )
    )
    assert.deepEqual(criticals, [])
  })

  test('errors when the bound credential is not wired', () => {
    const { logger, criticals } = makeCriticalLogger()
    validateRemoteAddonAuth(
      logger,
      makeRemoteState(
        '/tmp',
        {
          package: '@pikkufabric/addon-registry',
          remote: true,
          authCredentialId: 'ghostToken',
        },
        { credentials: [] }
      )
    )
    assert.equal(criticals.length, 1)
    assert.equal(criticals[0]!.code, ErrorCode.REMOTE_ADDON_AUTH_UNRESOLVED)
    assert.match(criticals[0]!.message, /ghostToken/)
  })

  test('errors when the bound secret is not wired', () => {
    const { logger, criticals } = makeCriticalLogger()
    validateRemoteAddonAuth(
      logger,
      makeRemoteState(
        '/tmp',
        {
          package: '@pikkufabric/addon-registry',
          remote: true,
          authSecretId: 'ghostSecret',
        },
        { secrets: [] }
      )
    )
    assert.equal(criticals.length, 1)
    assert.equal(criticals[0]!.code, ErrorCode.REMOTE_ADDON_AUTH_UNRESOLVED)
  })
})

const makeAgentState = (
  tools: string[],
  {
    functions = {},
    addonFunctions = {},
    addons = [],
    internalMeta = {},
  }: {
    functions?: Record<string, any>
    addonFunctions?: Record<string, Record<string, any>>
    addons?: string[]
    internalMeta?: Record<string, string>
  } = {}
): Omit<InspectorState, 'typesLookup'> =>
  ({
    agents: {
      agentsMeta: {
        triage: { tools, sourceFile: 'src/triage.agent.ts' },
      },
    },
    rpc: {
      internalMeta,
      wireAddonDeclarations: new Map(
        addons.map((name) => [name, { package: `@addon/${name}` }])
      ),
    },
    functions: { meta: functions },
    addonFunctions,
  }) as unknown as Omit<InspectorState, 'typesLookup'>

describe('validateAgentToolReferences (ref() resolved at build time)', () => {
  test('a local tool that does not exist is an error', () => {
    const { logger, criticals } = makeCriticalLogger()
    validateAgentToolReferences(
      logger,
      makeAgentState(['doesNotExist'], {
        functions: { realTool: { description: 'A real one' } },
      })
    )
    assert.equal(criticals.length, 1)
    assert.equal(criticals[0]!.code, ErrorCode.AGENT_TOOL_NOT_FOUND)
  })

  test('an addon namespace that is not wired is an error, and lists the ones that are', () => {
    const { logger, criticals } = makeCriticalLogger()
    validateAgentToolReferences(
      logger,
      makeAgentState(['nope:thing'], { addons: ['todos'] })
    )
    assert.equal(criticals.length, 1)
    assert.equal(criticals[0]!.code, ErrorCode.AGENT_TOOL_UNKNOWN_NAMESPACE)
    assert.match(criticals[0]!.message, /Wired namespaces: todos/)
  })

  test('a wired addon that does not export the function is an error', () => {
    const { logger, criticals } = makeCriticalLogger()
    validateAgentToolReferences(
      logger,
      makeAgentState(['todos:noSuchFn'], {
        addons: ['todos'],
        addonFunctions: { todos: { addTodo: { description: 'Adds a todo' } } },
      })
    )
    assert.equal(criticals.length, 1)
    assert.equal(criticals[0]!.code, ErrorCode.AGENT_TOOL_NOT_FOUND)
  })

  test('an addon that has not been built yet is not treated as a missing function', () => {
    const { logger, criticals } = makeCriticalLogger()
    validateAgentToolReferences(
      logger,
      makeAgentState(['todos:addTodo'], { addons: ['todos'] })
    )
    assert.deepEqual(criticals, [])
  })

  test('a workflow reference is resolved elsewhere and left alone', () => {
    const { logger, criticals } = makeCriticalLogger()
    validateAgentToolReferences(
      logger,
      makeAgentState(['workflow:onboarding']),
      { strictMeta: true }
    )
    assert.deepEqual(criticals, [])
  })

  test('a missing description is only an error under strictMeta', () => {
    const state = makeAgentState(['bareTool'], {
      functions: { bareTool: {} },
    })

    const lenient = makeCriticalLogger()
    validateAgentToolReferences(lenient.logger, state)
    assert.deepEqual(lenient.criticals, [])

    const strict = makeCriticalLogger()
    validateAgentToolReferences(strict.logger, state, { strictMeta: true })
    assert.equal(strict.criticals.length, 1)
    assert.equal(
      strict.criticals[0]!.code,
      ErrorCode.AGENT_TOOL_MISSING_DESCRIPTION
    )
  })

  test('a title does not satisfy strictMeta, and the message says so', () => {
    const { logger, criticals } = makeCriticalLogger()
    validateAgentToolReferences(
      logger,
      makeAgentState(['titledTool'], {
        functions: { titledTool: { title: 'Titled Tool' } },
      }),
      { strictMeta: true }
    )
    assert.equal(criticals.length, 1)
    assert.equal(criticals[0]!.code, ErrorCode.AGENT_TOOL_MISSING_DESCRIPTION)
    assert.match(criticals[0]!.message, /a 'title' does not count/)
  })

  test('an addon function is checked against the addon’s own meta', () => {
    const { logger, criticals } = makeCriticalLogger()
    validateAgentToolReferences(
      logger,
      makeAgentState(['todos:addTodo'], {
        addons: ['todos'],
        addonFunctions: { todos: { addTodo: { description: 'Adds a todo' } } },
      }),
      { strictMeta: true }
    )
    assert.deepEqual(criticals, [])
  })
})

const makeModelState = (
  models: Record<string, string>
): Omit<InspectorState, 'typesLookup'> =>
  ({
    agents: {
      agentsMeta: Object.fromEntries(
        Object.entries(models).map(([name, model]) => [
          name,
          { name, model, sourceFile: `src/${name}.agent.ts` },
        ])
      ),
    },
  }) as unknown as Omit<InspectorState, 'typesLookup'>

describe('validateAgentModels (aliases resolve against pikku.config.json)', () => {
  test('a provider-qualified model needs no alias', () => {
    const { logger, criticals } = makeCriticalLogger()
    validateAgentModels(logger, makeModelState({ triage: 'openai/gpt-5-mini' }))
    assert.deepEqual(criticals, [])
  })

  test('a missing model is still reported', () => {
    const { logger, criticals } = makeCriticalLogger()
    validateAgentModels(logger, makeModelState({ triage: '' }))
    assert.equal(criticals.length, 1)
    assert.equal(criticals[0]!.code, ErrorCode.MISSING_MODEL)
  })

  test('a bare name that the models table defines is accepted', () => {
    const { logger, criticals } = makeCriticalLogger()
    validateAgentModels(logger, makeModelState({ triage: 'cheap' }), {
      cheap: 'openai/gpt-5-mini',
    })
    assert.deepEqual(criticals, [])
  })

  test('a bare name with no alias is an error naming the ones that exist', () => {
    const { logger, criticals } = makeCriticalLogger()
    validateAgentModels(logger, makeModelState({ triage: 'exspensive' }), {
      cheap: 'openai/gpt-5-mini',
      expensive: 'openai/gpt-5',
    })
    assert.equal(criticals.length, 1)
    assert.equal(criticals[0]!.code, ErrorCode.INVALID_MODEL)
    assert.match(criticals[0]!.message, /cheap, expensive/)
  })

  test('with no models table a bare name still fails, as it always has', () => {
    const { logger, criticals } = makeCriticalLogger()
    validateAgentModels(logger, makeModelState({ triage: 'gpt-5-mini' }))
    assert.equal(criticals.length, 1)
    assert.equal(criticals[0]!.code, ErrorCode.INVALID_MODEL)
  })

  for (const inherited of ['toString', 'constructor', '__proto__']) {
    test(`a bare '${inherited}' is not an alias just because Object has one`, () => {
      const { logger, criticals } = makeCriticalLogger()
      validateAgentModels(logger, makeModelState({ triage: inherited }), {
        cheap: 'openai/gpt-5-mini',
      })
      assert.equal(
        criticals.length,
        1,
        'an inherited property name must not read as a configured alias'
      )
      assert.equal(criticals[0]!.code, ErrorCode.INVALID_MODEL)
    })
  }
})
