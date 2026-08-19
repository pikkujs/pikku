import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import {
  pikkuServices,
  serializeServicesMap,
} from './pikku-command-services.js'

const SERVICES_IMPORT =
  "import type { SingletonServices } from './application-types.js'"
const WIRE_IMPORT = "import type { Services } from './application-types.js'"

describe('serializeServicesMap', () => {
  test('leaves auth optional when no auth factory is present', () => {
    const content = serializeServicesMap(
      ['auth', 'todoStore'],
      [],
      new Set(['todoStore']),
      [],
      SERVICES_IMPORT,
      WIRE_IMPORT,
      [],
      false
    )

    assert.match(content, /'auth': false,/)
    assert.doesNotMatch(content, /Pick<SingletonServices,[^>]*'auth'/)
  })

  test('marks auth required when an auth factory is injected', () => {
    const content = serializeServicesMap(
      ['auth', 'todoStore'],
      [],
      new Set(['todoStore']),
      [],
      SERVICES_IMPORT,
      WIRE_IMPORT,
      [],
      true
    )

    assert.match(content, /'auth': true,/)
    assert.match(content, /Required<Pick<SingletonServices,[^>]*'auth'/)
  })

  test('upgrades picked required services from optional to required', () => {
    const content = serializeServicesMap(
      ['auth', 'kysely', 'todoStore'],
      ['customWire'],
      new Set(['kysely', 'customWire']),
      [],
      SERVICES_IMPORT,
      WIRE_IMPORT,
      [],
      false
    )

    assert.match(content, /Required<Pick<SingletonServices,[^>]*'kysely'/)
    assert.match(content, /Required<Pick<Services,[^>]*'customWire'/)
  })

  test('marks the framework singletons required for an addon build', () => {
    const content = serializeServicesMap(
      ['stripe', 'stripeWebhookVerifier'],
      [],
      new Set(['stripe']),
      [],
      SERVICES_IMPORT,
      WIRE_IMPORT,
      [],
      false,
      false
    )

    assert.doesNotMatch(
      content,
      /export type RequiredSingletonServices = Partial<SingletonServices>/
    )
    for (const service of [
      'config',
      'logger',
      'variables',
      'schema',
      'secrets',
    ]) {
      assert.match(content, new RegExp(`'${service}': true,`))
      assert.match(
        content,
        new RegExp(`Required<Pick<SingletonServices,[^>]*'${service}'`)
      )
    }
    assert.match(content, /'stripe': true,/)
    assert.match(content, /'stripeWebhookVerifier': false,/)
  })

  test('emits an unchanged map for an app build that already declares the framework singletons', () => {
    const content = serializeServicesMap(
      [
        'config',
        'logger',
        'variables',
        'schema',
        'secrets',
        'kysely',
        'todoStore',
      ],
      [],
      new Set(['kysely']),
      [],
      SERVICES_IMPORT,
      WIRE_IMPORT,
      [],
      false,
      false
    )

    assert.equal(
      content,
      [
        SERVICES_IMPORT,
        WIRE_IMPORT,
        '',
        '// Singleton services map: true if required, false if available but unused',
        'export const requiredSingletonServices = {',
        "  'config': true,",
        "  'kysely': true,",
        "  'logger': true,",
        "  'schema': true,",
        "  'secrets': true,",
        "  'todoStore': false,",
        "  'variables': true,",
        '} as const',
        '',
        '// Wire services map: true if required, false if available but unused',
        'export const requiredWireServices = {',
        '} as const',
        '',
        '// Type exports',
        "export type RequiredSingletonServices = Required<Pick<SingletonServices, 'config' | 'kysely' | 'logger' | 'schema' | 'secrets' | 'variables'>> & Partial<Omit<SingletonServices, 'config' | 'kysely' | 'logger' | 'schema' | 'secrets' | 'variables'>>",
        '',
        'export type RequiredWireServices = Partial<Services>',
        '',
      ].join('\n')
    )
  })

  test('leaves agentRunService optional when no agent scaffold is configured', () => {
    const content = serializeServicesMap(
      ['agentRunService', 'todoStore'],
      [],
      new Set(['todoStore']),
      [],
      SERVICES_IMPORT,
      WIRE_IMPORT,
      [],
      false,
      false
    )

    assert.match(content, /'agentRunService': false,/)
    assert.doesNotMatch(
      content,
      /Pick<SingletonServices,[^>]*'agentRunService'/
    )
  })

  test('marks agentRunService required when the agent scaffold is configured', () => {
    // The generated public-agent permission (isThreadOwner) always destructures
    // agentRunService, but it is written to disk after requiredServices is
    // computed, so the inspector never sees it — this has to be force-required.
    const content = serializeServicesMap(
      ['agentRunService', 'todoStore'],
      [],
      new Set(['todoStore']),
      [],
      SERVICES_IMPORT,
      WIRE_IMPORT,
      [],
      false,
      true
    )

    assert.match(content, /'agentRunService': true,/)
    assert.match(
      content,
      /Required<Pick<SingletonServices,[^>]*'agentRunService'/
    )
  })
})

describe('pikkuServices', () => {
  const createVisitState = (authDefinition?: unknown) => ({
    filesAndMethodsErrors: new Map(),
    filesAndMethods: {
      singletonServicesType: {
        type: 'SingletonServices',
        typePath: '/virtual/types/application-types.ts',
      },
      wireServicesType: {
        type: 'Services',
        typePath: '/virtual/types/application-types.ts',
      },
    },
    serviceAggregation: {
      allSingletonServices: ['auth', 'todoStore'],
      allWireServices: [],
      requiredServices: new Set(['todoStore']),
    },
    addonRequiredParentServices: [],
    ...(authDefinition === undefined
      ? {}
      : { auth: { definition: authDefinition } }),
  })

  const createContext = async (
    servicesFile: string,
    authDefinition?: unknown
  ) => ({
    logger: {
      debug: () => {},
    },
    config: {
      forceRequiredServices: [],
      packageMappings: {},
      servicesFile,
    },
    getInspectorState: async () => createVisitState(authDefinition),
  })

  test('keeps auth optional when inspector state has no auth definition', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'pikku-command-services-'))
    const servicesFile = join(outDir, 'pikku-services.gen.ts')

    await (pikkuServices as any).func(
      await createContext(servicesFile),
      undefined,
      {}
    )

    const content = await readFile(servicesFile, 'utf8')
    assert.match(content, /'auth': false,/)
  })

  test('marks auth required when inspector state exposes an auth definition', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'pikku-command-services-'))
    const servicesFile = join(outDir, 'pikku-services.gen.ts')

    await (pikkuServices as any).func(
      await createContext(servicesFile, {}),
      undefined,
      {}
    )

    const content = await readFile(servicesFile, 'utf8')
    assert.match(content, /'auth': true,/)
  })

  // An unresolved `SingletonServices` used to be written out as an empty map,
  // which made every service optional downstream and surfaced as a scatter of
  // "possibly undefined" errors in files that had not changed. The type is
  // never genuinely empty, so an empty list is the failure itself.
  test('refuses to write a services map when the singleton type did not resolve', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'pikku-command-services-'))
    const servicesFile = join(outDir, 'pikku-services.gen.ts')
    const context = await createContext(servicesFile)
    const visitState = await context.getInspectorState()
    visitState.serviceAggregation.allSingletonServices = []

    await assert.rejects(
      () =>
        (pikkuServices as any).func(
          { ...context, getInspectorState: async () => visitState },
          undefined,
          {}
        ),
      /PKU724/
    )
  })
})
