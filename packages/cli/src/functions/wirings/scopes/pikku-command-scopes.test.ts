import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { withAddonOrigin, withAppScopes } from './pikku-command-scopes.js'

const persona = (id: string, app?: string) =>
  ({ id, name: id, roles: [], goals: [], tags: [], runnable: true, app }) as any

const scope = (name: string, sourceFile?: string) =>
  ({ name, scopes: {}, sourceFile }) as any

describe('withAppScopes', () => {
  test('appends the app tree the personas imply', () => {
    const definitions = withAppScopes(
      [scope('admin')],
      [persona('a', 'staff'), persona('b', 'portal')]
    )

    assert.deepEqual(
      definitions.map((d) => d.name),
      ['admin', 'app']
    )
  })

  test('leaves the declarations alone when no persona names an app', () => {
    const declared = [scope('admin')]

    assert.equal(withAppScopes(declared, [persona('a')]), declared)
  })

  // Two trees answering to `app` would make `app:staff` mean whichever the
  // store returned first, and the grant provisioning writes is the one that
  // would silently stop being declared.
  test('refuses a hand-declared app root, naming where it came from', () => {
    assert.throws(
      () =>
        withAppScopes([scope('app', 'src/scopes.ts')], [persona('a', 'staff')]),
      /reserved.*src\/scopes\.ts/s
    )
  })

  // The root is reserved by name, not by whether the derivation happens to
  // produce a tree this run: a project whose personas name no app would
  // otherwise compile with a hand-declared `app` and start failing the day
  // someone gave a persona one.
  test('refuses it even when no persona names an app', () => {
    assert.throws(
      () => withAppScopes([scope('app', 'src/scopes.ts')], [persona('a')]),
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
