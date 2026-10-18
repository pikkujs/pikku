import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import { aggregateRequiredServices } from '../utils/post-process.js'
import type { ErrorCode } from '../error-codes.js'
import type { InspectorLogger } from '../types.js'

type Logged = { code?: ErrorCode; message: string; level?: 'warn' }

const makeLogger = (logged: Logged[]) =>
  ({
    debug: () => {},
    info: () => {},
    warn: (message: string) => {
      logged.push({ message, level: 'warn' })
    },
    error: (message: string) => {
      logged.push({ message })
    },
    diagnostic: ({ code, message }) => {
      logged.push({ code, message })
    },
    critical: (code: ErrorCode, message: string) => {
      logged.push({ code, message })
    },
    hasCriticalErrors: () => false,
  }) satisfies InspectorLogger

const withProject = async (
  files: Record<string, string[]>,
  assertions: (
    state: Awaited<ReturnType<typeof inspect>>,
    rootDir: string,
    logged: Logged[]
  ) => void
) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-global-permission-'))
  const paths: string[] = []
  for (const [name, lines] of Object.entries(files)) {
    const path = join(rootDir, name)
    await writeFile(path, lines.join('\n'))
    paths.push(path)
  }
  const logged: Logged[] = []
  try {
    assertions(
      await inspect(makeLogger(logged), paths, { rootDir }),
      rootDir,
      logged
    )
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

describe('addGlobalPermission', () => {
  test('records the file of a top-level registration', async () => {
    await withProject(
      {
        'security.ts': [
          "import { addGlobalPermission, pikkuPermission } from '#pikku/auth'",
          'addGlobalPermission([',
          '  pikkuPermission(async ({ kysely }, _data, { session }) => !!session && !!kysely),',
          '])',
        ],
      },
      (state, rootDir, logged) => {
        assert.equal(state.permissions.global.length, 1)
        const [registration] = state.permissions.global
        assert.equal(registration!.sourceFile, join(rootDir, 'security.ts'))
        assert.equal(registration!.exportName, null)
        assert.equal(registration!.definitionIds.length, 1)
        const definition =
          state.permissions.definitions[registration!.definitionIds[0]!]
        assert.deepEqual(definition?.services.services, ['kysely'])
        assert.deepEqual(
          logged,
          [],
          'an inline permission in the global array is not an unassigned one'
        )
      }
    )
  })

  test('records an exported factory by name, and references by id', async () => {
    await withProject(
      {
        'security.ts': [
          "import { addGlobalPermission as everywhere, pikkuAuth } from '#pikku/auth'",
          'export const signedIn = pikkuAuth(async (_s, session) => !!session)',
          'export const globalGate = () => everywhere([signedIn])',
        ],
      },
      (state) => {
        assert.deepEqual(
          state.permissions.global.map((g) => [g.exportName, g.definitionIds]),
          [['globalGate', ['signedIn']]]
        )
      }
    )
  })

  test('counts what global permissions touch as required services', async () => {
    await withProject(
      {
        'security.ts': [
          "import { addGlobalPermission, pikkuPermission } from '#pikku/auth'",
          'export const audited = pikkuPermission(async ({ auditLog }) => !!auditLog)',
          'addGlobalPermission({ audited })',
        ],
      },
      (state) => {
        state.serviceAggregation.requiredServices.clear()
        aggregateRequiredServices(state)
        assert.ok(state.serviceAggregation.requiredServices.has('auditLog'))
      }
    )
  })
})

describe('addGlobalPermission factory shapes', () => {
  const header = [
    "import { addGlobalPermission, pikkuAuth } from '#pikku/auth'",
    'export const signedIn = pikkuAuth(async (_s, session) => !!session)',
  ]

  const registrations = (state: Awaited<ReturnType<typeof inspect>>) =>
    state.permissions.global.map((g) => [g.exportName, g.definitionIds])

  test('a block-bodied exported arrow is a factory', async () => {
    await withProject(
      {
        'security.ts': [
          ...header,
          'export const globalGate = () => {',
          '  addGlobalPermission([signedIn])',
          '}',
        ],
      },
      (state, _root, logged) => {
        assert.deepEqual(registrations(state), [['globalGate', ['signedIn']]])
        assert.deepEqual(logged, [])
      }
    )
  })

  test('an exported function declaration is a factory', async () => {
    await withProject(
      {
        'security.ts': [
          ...header,
          'export function globalGate() {',
          '  addGlobalPermission([signedIn])',
          '}',
        ],
      },
      (state) => {
        assert.deepEqual(registrations(state), [['globalGate', ['signedIn']]])
      }
    )
  })

  test('a function exported through an export list is a factory', async () => {
    await withProject(
      {
        'security.ts': [
          ...header,
          'function globalGate() {',
          '  addGlobalPermission([signedIn])',
          '}',
          'export { globalGate }',
        ],
      },
      (state) => {
        assert.deepEqual(registrations(state), [['globalGate', ['signedIn']]])
      }
    )
  })

  test('a function invoked where it is written runs on import', async () => {
    await withProject(
      {
        'security.ts': [
          ...header,
          ';(() => {',
          '  addGlobalPermission([signedIn])',
          '})()',
        ],
      },
      (state, _root, logged) => {
        assert.deepEqual(registrations(state), [[null, ['signedIn']]])
        assert.deepEqual(logged, [])
      }
    )
  })

  for (const [label, lines] of [
    [
      'a function that is not exported',
      ['function gate() {', '  addGlobalPermission([signedIn])', '}'],
    ],
    [
      'an exported function that takes a parameter',
      [
        'export const gate = (flag: boolean) => {',
        '  if (flag) addGlobalPermission([signedIn])',
        '}',
      ],
    ],
    [
      'a default export',
      [
        'export default function () {',
        '  addGlobalPermission([signedIn])',
        '}',
      ],
    ],
  ] as const) {
    test(`${label} is not recorded, and says so`, async () => {
      await withProject(
        { 'security.ts': [...header, ...lines] },
        (state, _root, logged) => {
          assert.deepEqual(registrations(state), [])
          const warnings = logged.filter((entry) => entry.level === 'warn')
          assert.equal(warnings.length, 1)
          assert.match(warnings[0]!.message, /NOT registered/)
        }
      )
    })
  }
})

describe('addGlobalPermission arguments held in a variable', () => {
  test('follows a const array to its permissions and services', async () => {
    await withProject(
      {
        'security.ts': [
          "import { addGlobalPermission, pikkuPermission } from '#pikku/auth'",
          'export const audited = pikkuPermission(async ({ auditLog }) => !!auditLog)',
          'const gates = [audited] as const',
          'addGlobalPermission(gates)',
        ],
      },
      (state, _root, logged) => {
        assert.deepEqual(
          state.permissions.global.map((g) => g.definitionIds),
          [['audited']]
        )
        assert.deepEqual(
          logged.filter((entry) => entry.level === 'warn'),
          [],
          'a variable that resolves to a literal needs no warning'
        )
        state.serviceAggregation.requiredServices.clear()
        aggregateRequiredServices(state)
        assert.ok(state.serviceAggregation.requiredServices.has('auditLog'))
      }
    )
  })

  test('follows a const object, and a const imported from another file', async () => {
    await withProject(
      {
        'gates.ts': [
          "import { pikkuPermission } from '#pikku/auth'",
          'export const audited = pikkuPermission(async ({ auditLog }) => !!auditLog)',
          'export const gates = { audited }',
        ],
        'security.ts': [
          "import { addGlobalPermission } from '#pikku/auth'",
          "import { gates } from './gates'",
          'addGlobalPermission(gates)',
        ],
      },
      (state, _root, logged) => {
        assert.deepEqual(
          state.permissions.global.map((g) => g.definitionIds),
          [['audited']]
        )
        assert.deepEqual(
          logged.filter((entry) => entry.level === 'warn'),
          []
        )
      }
    )
  })

  test('still warns for an argument it cannot follow', async () => {
    await withProject(
      {
        'security.ts': [
          "import { addGlobalPermission } from '#pikku/auth'",
          'declare const build: () => never[]',
          'addGlobalPermission(build())',
        ],
      },
      (_state, _root, logged) => {
        const warnings = logged.filter((entry) => entry.level === 'warn')
        assert.equal(warnings.length, 1)
        assert.match(warnings[0]!.message, /cannot be seen/)
      }
    )
  })
})
