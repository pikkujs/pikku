import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import { ErrorCode } from '../error-codes.js'
import type { InspectorLogger } from '../types.js'

const makeLogger = (criticals: Array<{ code: ErrorCode; message: string }>) =>
  ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: ({ code, message }) => {
      criticals.push({ code, message })
    },
    critical: (code: ErrorCode, message: string) => {
      criticals.push({ code, message })
    },
    hasCriticalErrors: () => criticals.length > 0,
  }) satisfies InspectorLogger

const inspectSource = async (source: string) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-personas-'))
  const file = join(rootDir, 'personas.ts')
  await writeFile(file, source)
  const criticals: Array<{ code: ErrorCode; message: string }> = []
  try {
    const state = await inspect(makeLogger(criticals), [file], { rootDir })
    return { state, criticals }
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

/** Inspects several files at once, keyed by basename. */
const inspectSources = async (sources: Record<string, string>) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-personas-multi-'))
  const files: Record<string, string> = {}
  for (const [name, source] of Object.entries(sources)) {
    files[name] = join(rootDir, name)
    await writeFile(files[name]!, source)
  }
  const criticals: Array<{ code: ErrorCode; message: string }> = []
  try {
    const state = await inspect(makeLogger(criticals), Object.values(files), {
      rootDir,
    })
    return { state, criticals, files }
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

/** The declared world every persona below is checked against. */
const withRoles = (...lines: string[]) =>
  [
    "import { defineScope } from '@pikku/core/ecosystem/scope'",
    "import { defineSystemRole } from '@pikku/core/ecosystem/role'",
    "import { definePersonas } from '@pikku/core/persona'",
    'defineScope({ catalogue: { scopes: { read: {} } }, admin: {} })',
    'defineSystemRole({',
    "  buyer: { scopes: ['catalogue:read'] },",
    "  admin: { scopes: ['admin'] },",
    '})',
    ...lines,
  ].join('\n')

describe('addPersonas inspector', () => {
  test('extracts a whole person', async () => {
    const { state, criticals } = await inspectSource(
      withRoles(
        'definePersonas({',
        '  susan: {',
        "    name: 'Susan',",
        "    jobTitle: 'Buys for a small café',",
        "    roles: ['buyer'],",
        "    personality: 'Hunts cheap deals.',",
        "    goals: ['Get the weekly order in under five minutes'],",
        "    tags: ['commerce'],",
        "    disposition: 'careless',",
        '    tuning: { repeatRate: 0.3 },',
        "    fixtures: ['seedCatalogue'],",
        '    account: {},',
        '  },',
        '})'
      )
    )

    assert.deepEqual(criticals, [])
    assert.equal(state.personas.definitions.length, 1)
    const susan = state.personas.definitions[0]!
    assert.equal(susan.id, 'susan')
    assert.equal(susan.name, 'Susan')
    assert.equal(susan.jobTitle, 'Buys for a small café')
    assert.deepEqual(susan.roles, ['buyer'])
    assert.equal(susan.personality, 'Hunts cheap deals.')
    assert.deepEqual(susan.goals, [
      'Get the weekly order in under five minutes',
    ])
    assert.deepEqual(susan.tags, ['commerce'])
    assert.equal(susan.disposition, 'careless')
    assert.deepEqual(susan.tuning, { repeatRate: 0.3 })
    assert.deepEqual(susan.fixtures, ['seedCatalogue'])
    assert.deepEqual(susan.account, {})
    assert.equal(susan.runnable, true)
  })

  test('extracts a declared avatar', async () => {
    const { state } = await inspectSource(
      withRoles(
        'definePersonas({',
        '  susan: {',
        "    name: 'Susan',",
        "    avatarUrl: '/avatars/susan.png',",
        '  },',
        '})'
      )
    )
    assert.equal(state.personas.definitions[0]!.avatarUrl, '/avatars/susan.png')
  })

  // The console draws a colour-and-icon avatar from the persona's id when none
  // is declared, so an absent field has to stay absent rather than become an
  // empty string the renderer would treat as a broken image.
  test('leaves the avatar absent when none is declared', async () => {
    const { state } = await inspectSource(
      withRoles('definePersonas({', "  susan: { name: 'Susan' },", '})')
    )
    assert.equal(state.personas.definitions[0]!.avatarUrl, undefined)
  })

  test('extracts the environments a persona declares', async () => {
    const { state } = await inspectSource(
      withRoles(
        'definePersonas({',
        '  robin: {',
        "    name: 'Robin',",
        "    disposition: 'accountable',",
        "    environments: ['staging', 'prod'],",
        '  },',
        '})'
      )
    )
    assert.deepEqual(state.personas.definitions[0]!.environments, [
      'staging',
      'prod',
    ])
  })

  // "Everywhere but production" is a fact about the config, and the meta file
  // outlives whichever environments were configured the day it was written —
  // so the absence is preserved rather than resolved into a list here.
  test('leaves environments absent when none are declared', async () => {
    const { state } = await inspectSource(
      withRoles('definePersonas({', "  susan: { name: 'Susan' },", '})')
    )
    assert.equal(state.personas.definitions[0]!.environments, undefined)
  })

  test('the declaration key is the id', async () => {
    const { state } = await inspectSource(
      withRoles(
        'definePersonas({',
        "  susan: { name: 'Susan' },",
        "  mallory: { name: 'Mallory' },",
        '})'
      )
    )
    assert.deepEqual(
      state.personas.definitions.map((p) => p.id),
      ['susan', 'mallory']
    )
  })

  test('a persona without a name is refused', async () => {
    const { state, criticals } = await inspectSource(
      withRoles('definePersonas({', "  susan: { roles: ['buyer'] },", '})')
    )
    assert.equal(state.personas.definitions.length, 0)
    assert.ok(criticals.some((c) => /needs a literal 'name'/.test(c.message)))
  })

  test('an unknown disposition is refused rather than defaulted', async () => {
    const { state, criticals } = await inspectSource(
      withRoles(
        'definePersonas({',
        "  susan: { name: 'Susan', disposition: 'grumpy' },",
        '})'
      )
    )
    assert.equal(state.personas.definitions.length, 0)
    assert.ok(
      criticals.some((c) => /unknown disposition 'grumpy'/.test(c.message))
    )
  })

  // `repeatRate: 18` meaning 18% would silently double every call, and the run
  // would read as a product bug.
  test('a tuning dial outside its range is refused', async () => {
    const { state, criticals } = await inspectSource(
      withRoles(
        'definePersonas({',
        "  susan: { name: 'Susan', tuning: { repeatRate: 18 } },",
        '})'
      )
    )
    assert.equal(state.personas.definitions.length, 0)
    assert.ok(
      criticals.some((c) =>
        /repeatRate must be between 0 and 1/.test(c.message)
      )
    )
  })

  test('a linked account is extracted alongside the primary one', async () => {
    const { state, criticals } = await inspectSource(
      withRoles(
        'definePersonas({',
        '  yasser: {',
        "    name: 'Yasser',",
        '    account: {},',
        "    linkedAccounts: { google: { provider: 'google' } },",
        '  },',
        '})'
      )
    )
    assert.deepEqual(criticals, [])
    const yasser = state.personas.definitions[0]!
    assert.deepEqual(yasser.account, {})
    assert.deepEqual(yasser.linkedAccounts, { google: { provider: 'google' } })
    // Their primary login is email+password, so they can still be driven.
    assert.equal(yasser.runnable, true)
  })

  // Driving a consent screen needs a human — refused at the CLI rather than
  // failing somewhere inside a browser.
  test('a persona whose own login is a provider is not runnable', async () => {
    const { state } = await inspectSource(
      withRoles(
        'definePersonas({',
        "  yasser: { name: 'Yasser', account: { provider: 'google' } },",
        '})'
      )
    )
    assert.equal(state.personas.definitions[0]!.runnable, false)
  })

  test('a person who is only ever acted upon says so', async () => {
    const { state } = await inspectSource(
      withRoles(
        'definePersonas({',
        "  target: { name: 'Target', account: {}, runnable: false },",
        '})'
      )
    )
    assert.equal(state.personas.definitions[0]!.runnable, false)
  })

  // One call site per codebase, so there is one place to read the cast from
  // and one place to add to. The keyed form above is how you declare more.
  test('a second definePersonas in the same file is refused', async () => {
    const { state, criticals } = await inspectSource(
      withRoles(
        "definePersonas({ susan: { name: 'Susan' } })",
        "definePersonas({ dave: { name: 'Dave' } })"
      )
    )

    const hit = criticals.find(
      (c) => c.code === ErrorCode.DUPLICATE_PERSONAS_DEFINITION
    )
    assert.ok(
      hit,
      `expected DUPLICATE_PERSONAS_DEFINITION, got ${JSON.stringify(criticals)}`
    )
    assert.deepEqual(
      state.personas.definitions.map((p) => p.id),
      ['susan']
    )
  })

  test('a second definePersonas in another file is refused', async () => {
    const { criticals, files } = await inspectSources({
      'personas.ts': withRoles("definePersonas({ susan: { name: 'Susan' } })"),
      'more-personas.ts': [
        "import { definePersonas } from '@pikku/core/persona'",
        "definePersonas({ dave: { name: 'Dave' } })",
      ].join('\n'),
    })

    const hit = criticals.find(
      (c) => c.code === ErrorCode.DUPLICATE_PERSONAS_DEFINITION
    )
    assert.ok(
      hit,
      `expected DUPLICATE_PERSONAS_DEFINITION, got ${JSON.stringify(criticals)}`
    )
    assert.ok(
      hit!.message.includes(files['personas.ts']!) &&
        hit!.message.includes(files['more-personas.ts']!),
      `expected both files named, got ${hit!.message}`
    )
  })

  // The CLI scaffolds personas of its own, and nobody adds a persona to a file
  // the next codegen run overwrites — so a generated declaration neither takes
  // the single slot nor collides with the app's own.
  test('a generated declaration neither claims the slot nor conflicts', async () => {
    const { state, criticals } = await inspectSources({
      'pikku-personas.gen.ts': [
        "import { definePersonas } from '@pikku/core/persona'",
        "definePersonas({ dave: { name: 'Dave' } })",
      ].join('\n'),
      'personas.ts': withRoles("definePersonas({ susan: { name: 'Susan' } })"),
    })

    assert.deepEqual(
      criticals.filter(
        (c) => c.code === ErrorCode.DUPLICATE_PERSONAS_DEFINITION
      ),
      [],
      `expected no duplicate critical, got ${JSON.stringify(criticals)}`
    )
    assert.deepEqual(state.personas.definitions.map((d) => d.id).sort(), [
      'dave',
      'susan',
    ])
  })

  // A half-read roles array typechecks, runs, and grants less than the source
  // says — so an unreadable one reads as absent.
  test('a computed roles array is not half-extracted', async () => {
    const { state } = await inspectSource(
      withRoles(
        'const r = "buyer"',
        'definePersonas({',
        "  susan: { name: 'Susan', roles: ['buyer', r] },",
        '})'
      )
    )
    assert.deepEqual(state.personas.definitions[0]!.roles, [])
  })
})

describe('validatePersonaRoles', () => {
  test('a declared system role is accepted', async () => {
    const { criticals } = await inspectSource(
      withRoles(
        'definePersonas({',
        "  susan: { name: 'Susan', roles: ['buyer', 'admin'] },",
        '})'
      )
    )
    assert.deepEqual(criticals, [])
  })

  // The failure this prevents: an admin deletes 'invoicing-clerk' from the
  // console, and Susan goes on claiming to test it while 403ing everywhere.
  test('a role that is not declared fails the build', async () => {
    const { criticals } = await inspectSource(
      withRoles(
        'definePersonas({',
        "  susan: { name: 'Susan', roles: ['invoicing-clerk'] },",
        '})'
      )
    )
    const critical = criticals.find((c) => /invoicing-clerk/.test(c.message))
    assert.ok(critical, `expected a critical, got ${JSON.stringify(criticals)}`)
    assert.match(critical!.message, /may only name a system role/)
    assert.match(critical!.message, /admin, buyer/)
  })

  test('a persona with no roles at all is fine', async () => {
    const { criticals } = await inspectSource(
      withRoles('definePersonas({', "  susan: { name: 'Susan' },", '})')
    )
    assert.deepEqual(criticals, [])
  })
})
