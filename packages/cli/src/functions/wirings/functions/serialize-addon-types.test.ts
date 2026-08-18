import { test, describe } from 'node:test'
import * as assert from 'assert'
import {
  serializeAddonInstallTypes,
  serializeAddonTypes,
} from './serialize-addon-types.js'
import { leafEntries } from './pikku-command-leaf-indexes.js'

/**
 * Installing an addon and authoring one are opposite ends of the same concept,
 * but they cannot share a specifier. A runtime template maps `#pikku/*` onto a
 * sibling package's `.pikku` through tsconfig `paths`, and `paths` are global
 * to a tsx process rather than scoped to the package that declared them — so a
 * linked addon's own `#pikku/addon` is resolved against the *application's*
 * leaf, which holds the install half and none of the authoring exports.
 *
 * Node never does this: `#pikku/*` is a package-private subpath import, and it
 * resolves against the addon's own `package.json`. The divergence is tsx's, and
 * the addon is what breaks, with `does not provide an export named
 * pikkuAddonServices` on a leaf that is perfectly correct on disk.
 *
 * Nesting the authoring half one level down is what separates them: an
 * application generates a flat `.pikku/<leaf>`, so `#pikku/addon/setup` has no
 * candidate to match there, and the resolver falls back to Node — which reads
 * the addon's own `imports` and finds the right file.
 */
describe('the addon leaves an application cannot shadow', () => {
  test('the authoring surface sits under a nested leaf', () => {
    const leaves = leafEntries.map(([leaf]) => leaf)

    assert.ok(
      leaves.includes('addon/setup'),
      'the addon-authoring surface must be a nested leaf, or an application`s flat `.pikku/addon` shadows it under tsx'
    )
  })

  test('the install surface keeps the bare leaf', () => {
    const leaves = leafEntries.map(([leaf]) => leaf)

    assert.ok(
      leaves.includes('addon'),
      'an application installs at #pikku/addon'
    )
  })

  test('the two halves never share a leaf', () => {
    const install = serializeAddonInstallTypes()
    const authoring = serializeAddonTypes(
      '',
      'SingletonServices',
      '',
      '',
      '',
      ''
    )

    assert.match(install, /wireAddon/)
    assert.doesNotMatch(
      install,
      /pikkuAddonServices/,
      'the install half must not carry an authoring export'
    )
    assert.match(authoring, /pikkuAddonServices/)
    assert.doesNotMatch(
      authoring,
      /export const wireAddon/,
      'the authoring half must not carry an install export'
    )
  })
})

/**
 * `wireAddon` and `wireRemoteAddon` wire an addon into an application. They sat
 * in core's rpc wiring because an addon is reached over rpc, but that is how
 * they are called rather than what they are, and it put the addon surface
 * behind `@pikku/core/rpc` for every consumer that only wanted to install one.
 */
describe('installing an addon reaches core through its own subpath', () => {
  test('the install half imports from @pikku/core/addon', () => {
    const install = serializeAddonInstallTypes()

    assert.match(install, /from '@pikku\/core\/addon'/)
    assert.doesNotMatch(install, /from '@pikku\/core\/rpc'/)
  })
})
