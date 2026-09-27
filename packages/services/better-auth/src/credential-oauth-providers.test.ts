import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import type { SecretValue } from '@pikku/core/classification'
import {
  credentialOAuthProviders,
  type CredentialOAuth2Configs,
  type CredentialOAuthSecretReader,
} from './credential-oauth-providers.js'

const configs: CredentialOAuth2Configs = {
  gmail: {
    appCredentialSecretId: 'GMAIL_APP',
    tokenSecretId: 'GMAIL_TOKENS',
    authorizationUrl: 'https://auth.example.com/authorize',
    tokenUrl: 'https://auth.example.com/token',
    scopes: ['mail.read'],
  },
}

const reader = (
  get: (secretId: string) => Promise<unknown>
): CredentialOAuthSecretReader =>
  ({ getSecret: get }) as unknown as CredentialOAuthSecretReader

const wrap = <T>(value: T) => ({ reveal: () => value }) as SecretValue<T>

describe('credentialOAuthProviders', () => {
  test('builds a provider from a configured app secret', async () => {
    const providers = await credentialOAuthProviders(
      configs,
      reader(async () => wrap({ clientId: 'id', clientSecret: 'shh' }))
    )

    assert.equal(providers.length, 1)
    assert.equal(providers[0]!.clientId, 'id')
  })

  // An optional secret resolves `undefined` rather than throwing, which is the
  // whole point of `optional`. Dereferencing that for `.reveal()` turned an
  // unconfigured provider — the case this function exists to survive — into a
  // TypeError that took down every getSession with it.
  test('an optional app secret that resolves undefined skips the provider', async () => {
    const warnings: string[] = []
    const providers = await credentialOAuthProviders(
      configs,
      reader(async () => undefined),
      { warn: (message) => warnings.push(message) }
    )

    assert.deepEqual(providers, [])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, /GMAIL_APP/)
  })

  test('a present but malformed app secret is still an error', async () => {
    await assert.rejects(
      () =>
        credentialOAuthProviders(
          configs,
          reader(async () => wrap({ clientSecret: 'shh' }))
        ),
      /no clientId/
    )
  })
})
