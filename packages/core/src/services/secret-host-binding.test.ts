import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SecretHostNotAllowedError,
  assertSecretAllowedForHost,
} from './secret-host-binding.js'
import type { SecretDefinitionsMeta } from '../wirings/secret/secret.types.js'

const definitions: SecretDefinitionsMeta = {
  notion: {
    name: 'notion',
    displayName: 'Notion',
    secretId: 'NOTION_KEY',
    allowedHosts: ['api.notion.com'],
  },
  stripe: {
    name: 'stripe',
    displayName: 'Stripe',
    secretId: 'STRIPE_KEY',
    allowedHosts: ['*.stripe.com'],
  },
  legacy: {
    name: 'legacy',
    displayName: 'Legacy',
    secretId: 'LEGACY_KEY',
  },
}

describe('assertSecretAllowedForHost', () => {
  test('allows a declared host', () => {
    assertSecretAllowedForHost(
      'NOTION_KEY',
      'https://api.notion.com/v1/pages',
      definitions
    )
  })

  test('refuses a host the secret was not declared for', () => {
    assert.throws(
      () =>
        assertSecretAllowedForHost(
          'NOTION_KEY',
          'https://attacker.test/collect',
          definitions
        ),
      SecretHostNotAllowedError
    )
  })

  test('never puts the secret value in the message', () => {
    assert.throws(
      () =>
        assertSecretAllowedForHost(
          'NOTION_KEY',
          'https://attacker.test/',
          definitions
        ),
      (error: Error) =>
        error.message.includes('NOTION_KEY') &&
        error.message.includes('attacker.test')
    )
  })

  test('matches a subdomain wildcard', () => {
    assertSecretAllowedForHost(
      'STRIPE_KEY',
      'https://api.stripe.com/v1/charges',
      definitions
    )
  })

  test('anchors the wildcard on a dot, so a suffix lookalike is refused', () => {
    assert.throws(
      () =>
        assertSecretAllowedForHost(
          'STRIPE_KEY',
          'https://stripe.com.attacker.test/',
          definitions
        ),
      SecretHostNotAllowedError
    )
  })

  test('a bare domain does not match its own subdomain wildcard', () => {
    assert.throws(
      () =>
        assertSecretAllowedForHost(
          'STRIPE_KEY',
          'https://stripe.com/',
          definitions
        ),
      SecretHostNotAllowedError
    )
  })

  test('is case insensitive on the host', () => {
    assertSecretAllowedForHost(
      'NOTION_KEY',
      'https://API.NOTION.COM/v1',
      definitions
    )
  })

  test('an undeclared secret is unrestricted by default', () => {
    assertSecretAllowedForHost(
      'LEGACY_KEY',
      'https://anywhere.test/',
      definitions
    )
    assertSecretAllowedForHost(
      'UNKNOWN_KEY',
      'https://anywhere.test/',
      definitions
    )
  })

  test('requireAllowedHosts refuses a secret that declares none', () => {
    assert.throws(
      () =>
        assertSecretAllowedForHost(
          'LEGACY_KEY',
          'https://anywhere.test/',
          definitions,
          true
        ),
      SecretHostNotAllowedError
    )
  })

  test('requireAllowedHosts still allows a declared pairing', () => {
    assertSecretAllowedForHost(
      'NOTION_KEY',
      'https://api.notion.com/v1',
      definitions,
      true
    )
  })
})
