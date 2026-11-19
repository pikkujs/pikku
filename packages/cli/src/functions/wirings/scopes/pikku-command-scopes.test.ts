import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  projectScopeDefinitions,
  withAddonOrigin,
  withAppScopes,
} from './pikku-command-scopes.js'

const virtualUser = (id: string, app?: string) =>
  ({ id, name: id, roles: [], goals: [], tags: [], runnable: true, app }) as any

const scope = (name: string, sourceFile?: string) =>
  ({ name, scopes: {}, sourceFile }) as any

describe('withAppScopes', () => {
  test('appends the app tree the virtual users imply', () => {
    const definitions = withAppScopes(
      [scope('admin')],
      [virtualUser('a', 'staff'), virtualUser('b', 'portal')]
    )

    assert.deepEqual(
      definitions.map((d) => d.name),
      ['admin', 'app']
    )
  })

  test('leaves the declarations alone when no virtual user names an app', () => {
    const declared = [scope('admin')]

    assert.equal(withAppScopes(declared, [virtualUser('a')]), declared)
  })

  // Two trees answering to `app` would make `app:staff` mean whichever the
  // store returned first, and the grant provisioning writes is the one that
  // would silently stop being declared.
  test('refuses a hand-declared app root, naming where it came from', () => {
    assert.throws(
      () =>
        withAppScopes(
          [scope('app', 'src/scopes.ts')],
          [virtualUser('a', 'staff')]
        ),
      /reserved.*src\/scopes\.ts/s
    )
  })

  // The root is reserved by name, not by whether the derivation happens to
  // produce a tree this run: a project whose virtual users name no app would
  // otherwise compile with a hand-declared `app` and start failing the day
  // someone gave a virtual user one.
  test('refuses it even when no virtual user names an app', () => {
    assert.throws(
      () => withAppScopes([scope('app', 'src/scopes.ts')], [virtualUser('a')]),
      /reserved.*src\/scopes\.ts/s
    )
  })
})

describe('withAddonOrigin', () => {
  const declared = [
    { name: 'billing', origin: { kind: 'app' } },
    { name: 'app', origin: { kind: 'generated' } },
  ] as any

  test("stamps an addon's own trees with its package and display name", () => {
    const definitions = withAddonOrigin(declared, '@acme/addon-billing', {
      displayName: 'Billing',
    })

    assert.deepEqual(definitions[0]!.origin, {
      kind: 'addon',
      package: '@acme/addon-billing',
      displayName: 'Billing',
    })
  })

  test('leaves what the CLI generated as generated', () => {
    const definitions = withAddonOrigin(declared, '@acme/addon-billing', true)

    assert.deepEqual(definitions[1]!.origin, { kind: 'generated' })
  })

  test('leaves an app that is not an addon alone', () => {
    assert.equal(withAddonOrigin(declared, undefined, undefined), declared)
  })
})

describe('projectScopeDefinitions', () => {
  test('is the declarations plus the app tree, stamped for an addon', () => {
    const state = {
      scopes: {
        definitions: [{ ...scope('billing'), origin: { kind: 'app' } }],
      },
      virtualUsers: { definitions: [virtualUser('a', 'staff')] },
    } as any

    assert.deepEqual(
      projectScopeDefinitions(state, {}).map((d) => d.name),
      ['billing', 'app']
    )
    assert.deepEqual(
      projectScopeDefinitions(state, { addonName: '@acme/addon-billing' })[0]
        ?.origin,
      { kind: 'addon', package: '@acme/addon-billing', displayName: undefined }
    )
  })
})
