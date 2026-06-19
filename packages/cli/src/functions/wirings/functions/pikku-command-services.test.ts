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
      typesDeclarationFile: '/virtual/generated/services.gen.ts',
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
})
