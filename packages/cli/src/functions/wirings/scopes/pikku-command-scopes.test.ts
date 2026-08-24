import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { withAppScopes } from './pikku-command-scopes.js'

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
        withAppScopes(
          [scope('app', 'src/scopes.ts')],
          [persona('a', 'staff')]
        ),
      /reserved.*src\/scopes\.ts/s
    )
  })
})
