import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { InspectorLogger } from '../types.js'

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

/**
 * The declaration is read purely as source — there is no `pikkuVirtualUser` to
 * import, because in a real project it is generated into the app's own types.
 * A local stub keeps the file compiling without pulling codegen into a unit
 * test; the visitor only ever looks at the call expression.
 */
const STUB = [
  'export const pikkuVirtualUser = (config: any) => config',
  '',
].join('\n')

async function run(source: string) {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-virtual-user-'))
  const file = join(rootDir, 'shop.virtual-user.ts')
  await writeFile(file, STUB + source)
  const criticals: Array<{ code: string; message: string }> = []
  const state = await inspect(makeLogger(criticals), [file], { rootDir })
  return {
    users: state.workflows.virtualUserFiles,
    criticals,
    file,
    cleanup: () => rm(rootDir, { recursive: true, force: true }),
  }
}

describe('addVirtualUser', () => {
  test('reads the whole declaration, because all of it is literal', async () => {
    const { users, criticals, file, cleanup } = await run(
      [
        'export const impatientShopper = pikkuVirtualUser({',
        "  name: 'Impatient shopper',",
        "  description: 'Buys in a hurry and does not read',",
        "  actor: 'shopper',",
        "  disposition: 'careless',",
        "  goals: ['buy something', 'change their mind about it'],",
        "  tags: ['checkout'],",
        "  grants: ['isShopper'],",
        "  fixtures: ['./fixtures/receipt.pdf'],",
        '  allowApprovalRequired: false,',
        "  budget: { steps: 30, mutations: 5, duration: '10m' },",
        '})',
      ].join('\n')
    )
    try {
      assert.deepEqual(criticals, [])
      assert.deepEqual(
        [...users.entries()],
        [
          [
            'impatientShopper',
            {
              path: file,
              exportedName: 'impatientShopper',
              actor: 'shopper',
              name: 'Impatient shopper',
              description: 'Buys in a hurry and does not read',
              disposition: 'careless',
              goals: ['buy something', 'change their mind about it'],
              tags: ['checkout'],
              grants: ['isShopper'],
              fixtures: ['./fixtures/receipt.pdf'],
              allowApprovalRequired: false,
              budget: { steps: 30, mutations: 5, duration: '10m' },
            },
          ],
        ]
      )
    } finally {
      await cleanup()
    }
  })

  test('an actor is all it takes — everything else has a default downstream', async () => {
    const { users, criticals, cleanup } = await run(
      [
        'export const anyone = pikkuVirtualUser({',
        "  actor: 'shopper',",
        '})',
      ].join('\n')
    )
    try {
      assert.deepEqual(criticals, [])
      const user = users.get('anyone')
      assert.equal(user?.actor, 'shopper')
      assert.equal(user?.disposition, undefined)
      assert.equal(user?.goals, undefined)
    } finally {
      await cleanup()
    }
  })

  test('without an actor there is nobody to sign in as, and that is fatal', async () => {
    const { users, criticals, cleanup } = await run(
      [
        'export const nobody = pikkuVirtualUser({',
        "  goals: ['do something'],",
        '})',
      ].join('\n')
    )
    try {
      assert.equal(users.size, 0)
      assert.equal(criticals.length, 1)
      assert.match(criticals[0]!.message, /needs a literal 'actor'/)
    } finally {
      await cleanup()
    }
  })

  test('an actor built at runtime cannot be read, and is not guessed at', async () => {
    const { users, criticals, cleanup } = await run(
      [
        'const which = process.env.ACTOR!',
        'export const mystery = pikkuVirtualUser({',
        '  actor: which,',
        '})',
      ].join('\n')
    )
    try {
      assert.equal(users.size, 0)
      assert.equal(criticals.length, 1)
      assert.match(criticals[0]!.message, /needs a literal 'actor'/)
    } finally {
      await cleanup()
    }
  })

  test('the export identifier is the id, so an unassigned one is fatal', async () => {
    const { users, criticals, cleanup } = await run(
      ["pikkuVirtualUser({ actor: 'shopper' })"].join('\n')
    )
    try {
      assert.equal(users.size, 0)
      assert.equal(criticals.length, 1)
      assert.match(criticals[0]!.message, /must be assigned to an export/)
    } finally {
      await cleanup()
    }
  })

  test('a misspelled disposition is refused, never quietly defaulted', async () => {
    const { users, criticals, cleanup } = await run(
      [
        'export const confused = pikkuVirtualUser({',
        "  actor: 'shopper',",
        "  disposition: 'adversarial ',",
        '})',
      ].join('\n')
    )
    try {
      assert.equal(users.size, 0)
      assert.equal(criticals.length, 1)
      assert.match(criticals[0]!.message, /unknown disposition 'adversarial '/)
    } finally {
      await cleanup()
    }
  })

  test('a budget that says nothing is left off rather than recorded empty', async () => {
    const { users, cleanup } = await run(
      [
        'export const shopper = pikkuVirtualUser({',
        "  actor: 'shopper',",
        '  budget: {},',
        '})',
      ].join('\n')
    )
    try {
      assert.equal(users.get('shopper')?.budget, undefined)
    } finally {
      await cleanup()
    }
  })
})
