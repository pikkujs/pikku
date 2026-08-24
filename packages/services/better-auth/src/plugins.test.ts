import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import * as barrel from './index.js'
import { PLUGIN_REGISTRY, pluginDisplayName } from './plugin-registry.js'

/**
 * The plugins this package ships, by the name an app writes in its
 * `betterAuth({ plugins: [...] })` array. That name is what the inspector reads
 * off the callee and what {@link PLUGIN_REGISTRY} is keyed by, so it is the
 * identity that has to line up across the barrel, the registry, and the
 * generated meta — not the plugin's internal `id`, which differs for two of
 * them (`ban` is `pikku-ban`, `delegatedAuth` is `delegated-auth`).
 */
const PIKKU_PLUGINS = [
  'actor',
  'ban',
  'credentialOAuth',
  'delegatedAuth',
  'fabric',
] as const

describe('pikku better-auth plugins', () => {
  // A factory reachable only from its own module is a plugin no app can wire:
  // `delegatedAuth` shipped that way, with its types re-exported and the
  // function left behind, which is invisible until someone tries the import.
  for (const name of PIKKU_PLUGINS) {
    test(`${name}() is exported from the package barrel`, () => {
      assert.equal(
        typeof (barrel as Record<string, unknown>)[name],
        'function',
        `${name} must be exported from index.ts, not only from its own module`
      )
    })
  }

  // Absent keys still render — `pluginDisplayName` Title-Cases the id — so a
  // missing entry costs only a worse label. A *stale* one is the real problem:
  // it advertises a plugin as supported in generated meta and in the console's
  // SSO page.
  test('every shipped plugin has a registry entry', () => {
    const missing = PIKKU_PLUGINS.filter((name) => !PLUGIN_REGISTRY[name])
    assert.deepEqual(missing, [])
  })

  test('the registry does not name better-auth admin(), which pikku refuses', () => {
    assert.equal(PLUGIN_REGISTRY['admin'], undefined)
  })

  test('an unregistered plugin still gets a readable name', () => {
    assert.equal(pluginDisplayName('someFuturePlugin'), 'Some Future Plugin')
  })
})
