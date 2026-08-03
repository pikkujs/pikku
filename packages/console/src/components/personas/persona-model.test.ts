import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { toPersonaEntries } from './persona-model.js'

const systemRoles = {
  buyer: {
    name: 'buyer',
    displayName: 'Buyer',
    description: 'Browses and orders',
    scopes: ['orders:create', 'catalogue:read'],
  },
  reporter: { name: 'reporter', scopes: ['reports:read', 'catalogue:read'] },
} as any

const workflows = {
  reorderFlow: {
    name: 'reorderFlow',
    scenario: true,
    title: 'Susan reorders last quarter',
    actors: ['susan'],
  },
  banFlow: {
    name: 'banFlow',
    scenario: true,
    actors: ['admin', 'terry'],
  },
  fixtureFlow: {
    name: 'fixtureFlow',
    scenario: true,
    tags: ['test-fixture'],
    actors: ['susan'],
  },
  notAScenario: { name: 'notAScenario', actors: ['susan'] },
} as any

const features = {
  buying: { name: 'Buying', entries: [{ scenario: 'reorderFlow' }] },
  moderation: { name: 'Moderation', entries: [{ scenario: 'banFlow' }] },
}

const personas = {
  susan: {
    id: 'susan',
    name: 'Susan Buyer',
    email: 'susan@personas.invalid',
    jobTitle: 'Procurement Lead',
    description: 'Buys on behalf of a 40-person team.',
    avatarUrl: '/avatars/susan.png',
    roles: ['buyer', 'reporter'],
    goals: ['Reorder last quarter'],
    tags: ['commerce'],
    disposition: 'realistic',
    runnable: true,
    account: {},
    linkedAccounts: { work: { provider: 'google' } },
  },
  terry: {
    id: 'terry',
    name: 'Terry Target',
    email: 'terry@personas.invalid',
    roles: [],
    goals: [],
    tags: [],
    runnable: false,
  },
  admin: {
    id: 'admin',
    name: 'Ada Admin',
    email: 'admin@personas.invalid',
    roles: ['ghost'],
    goals: [],
    tags: [],
    runnable: true,
  },
} as any

const build = () =>
  toPersonaEntries({ personas, systemRoles, workflows, features })

describe('toPersonaEntries', () => {
  test('sorts everyone by name, runnable or not', () => {
    assert.deepEqual(
      build().map((p) => p.key),
      ['admin', 'susan', 'terry']
    )
  })

  test('carries the whole declaration through', () => {
    const susan = build().find((p) => p.key === 'susan')!
    assert.equal(susan.name, 'Susan Buyer')
    assert.equal(susan.email, 'susan@personas.invalid')
    assert.equal(susan.jobTitle, 'Procurement Lead')
    assert.equal(susan.description, 'Buys on behalf of a 40-person team.')
    assert.equal(susan.avatarUrl, '/avatars/susan.png')
    assert.deepEqual(susan.goals, ['Reorder last quarter'])
    assert.deepEqual(susan.tags, ['commerce'])
    assert.equal(susan.disposition, 'realistic')
    assert.equal(susan.runnable, true)
  })

  test('resolves each role to what it confers', () => {
    const susan = build().find((p) => p.key === 'susan')!
    assert.deepEqual(susan.roles, [
      {
        name: 'buyer',
        displayName: 'Buyer',
        description: 'Browses and orders',
        scopes: ['catalogue:read', 'orders:create'],
        declared: true,
      },
      {
        name: 'reporter',
        displayName: undefined,
        description: undefined,
        scopes: ['catalogue:read', 'reports:read'],
        declared: true,
      },
    ])
  })

  test('merges the roles into one scope set, deduplicated', () => {
    const susan = build().find((p) => p.key === 'susan')!
    assert.deepEqual(susan.scopes, [
      'catalogue:read',
      'orders:create',
      'reports:read',
    ])
  })

  // The build refuses a persona naming an undeclared role, so this is meta
  // lagging the code. Rendering it as a role conferring nothing would read as
  // a deliberately empty role rather than as a stale file.
  test('marks a role the meta does not declare', () => {
    const admin = build().find((p) => p.key === 'admin')!
    assert.deepEqual(admin.roles, [
      {
        name: 'ghost',
        displayName: undefined,
        description: undefined,
        scopes: [],
        declared: false,
      },
    ])
    assert.deepEqual(admin.scopes, [])
  })

  test('lists the primary login alongside the linked ones', () => {
    const susan = build().find((p) => p.key === 'susan')!
    assert.deepEqual(susan.accounts, [
      { name: 'primary' },
      { name: 'work', provider: 'google' },
    ])
  })

  test('a persona with no declared account has no logins to show', () => {
    assert.deepEqual(build().find((p) => p.key === 'terry')!.accounts, [])
  })

  test('back-references the scenarios that cast them', () => {
    const susan = build().find((p) => p.key === 'susan')!
    assert.deepEqual(susan.scenarios, [
      { name: 'reorderFlow', displayName: 'Susan reorders last quarter' },
    ])
    assert.deepEqual(susan.features, ['Buying'])
  })

  test('falls back to an english name when a scenario has no title', () => {
    const admin = build().find((p) => p.key === 'admin')!
    assert.deepEqual(admin.scenarios, [
      { name: 'banFlow', displayName: 'Ban Flow' },
    ])
  })

  // A fixture is the scenario suite testing itself, and a plain workflow is not
  // a scenario at all — neither is something this persona "appears in".
  test('ignores suite fixtures and non-scenario workflows', () => {
    const susan = build().find((p) => p.key === 'susan')!
    assert.deepEqual(
      susan.scenarios.map((s) => s.name),
      ['reorderFlow']
    )
  })

  test('a persona nobody casts appears with an empty cast list', () => {
    const entries = toPersonaEntries({
      personas,
      systemRoles,
      workflows: {} as any,
      features: {},
    })
    assert.deepEqual(entries.find((p) => p.key === 'susan')!.scenarios, [])
    assert.deepEqual(entries.find((p) => p.key === 'susan')!.features, [])
  })
})
