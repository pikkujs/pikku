import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import { aggregateRequiredServices } from '../utils/post-process.js'
import type { ErrorCode } from '../error-codes.js'
import type { InspectorLogger } from '../types.js'

type Logged = { code?: ErrorCode; message: string }

const makeLogger = (logged: Logged[]) =>
  ({
    debug: () => {},
    info: () => {},
    warn: () => {},
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
