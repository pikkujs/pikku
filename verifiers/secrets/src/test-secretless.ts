/**
 * Verifies the secretless boundary: the runtime strip a cast runs into, and the
 * credential/host pairing that stops a resolved secret being sent anywhere.
 *
 * The compile-time half lives in `secretless.function.ts`, where destructuring
 * `secrets` inside a function carries a `@ts-expect-error` — `tsc -b` fails if
 * that stops being an error.
 */
import assert from 'node:assert/strict'
import {
  SecretAccessDeniedError,
  SecretHostNotAllowedError,
  assertSecretAllowedForHost,
  withoutSecrets,
} from '@pikku/core'
import type { SecretDefinitionsMeta } from '@pikku/core/secret'

const services = {
  logger: console,
  secrets: { getSecret: async () => 'super-secret' },
}

const stripped = withoutSecrets(services, 'a pikku function') as any

assert.throws(() => stripped.secrets, SecretAccessDeniedError)
assert.throws(() => {
  const { secrets } = stripped
  return secrets
}, SecretAccessDeniedError)
assert.equal('secrets' in { ...stripped }, false)
assert.ok(stripped.logger)
console.log('✓ withoutSecrets throws at the destructure, keeps other services')

const definitions: SecretDefinitionsMeta = {
  notion: {
    name: 'notion',
    displayName: 'Notion',
    secretId: 'NOTION_TOKEN',
    allowedHosts: ['*.notion.com'],
  },
  unbound: {
    name: 'unbound',
    displayName: 'Unbound',
    secretId: 'UNBOUND_TOKEN',
  },
}

assertSecretAllowedForHost(
  'NOTION_TOKEN',
  'https://api.notion.com/v1/pages',
  definitions
)
assert.throws(
  () =>
    assertSecretAllowedForHost(
      'NOTION_TOKEN',
      'https://notion.com.attacker.test/collect',
      definitions
    ),
  SecretHostNotAllowedError
)
console.log('✓ allowedHosts admits the declared host, refuses a lookalike')

assertSecretAllowedForHost(
  'UNBOUND_TOKEN',
  'https://anywhere.test',
  definitions
)
assert.throws(
  () =>
    assertSecretAllowedForHost(
      'UNBOUND_TOKEN',
      'https://anywhere.test',
      definitions,
      true
    ),
  SecretHostNotAllowedError
)
console.log('✓ an undeclared host is permissive by default, strict on request')

console.log('All secretless tests passed')
