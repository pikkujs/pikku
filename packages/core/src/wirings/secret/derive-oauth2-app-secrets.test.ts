import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { deriveOAuth2AppSecrets } from './derive-oauth2-app-secrets.js'
import type { CredentialDefinitions } from '../credential/credential.types.js'

const oauthCredential = (name: string, appSecretId: string) => ({
  name,
  displayName: 'Gmail',
  type: 'wire' as const,
  oauth2: {
    appCredentialSecretId: appSecretId,
    tokenSecretId: 'GMAIL_TOKENS',
    authorizationUrl: 'https://auth.example.com/authorize',
    tokenUrl: 'https://auth.example.com/token',
    scopes: ['mail.read'],
  },
})

describe('deriveOAuth2AppSecrets', () => {
  test('an OAuth2 credential implies its app secret', () => {
    const derived = deriveOAuth2AppSecrets(
      [oauthCredential('gmailOAuth', 'GMAIL_APP')] as CredentialDefinitions,
      []
    )

    assert.equal(derived.length, 1)
    assert.equal(derived[0]!.secretId, 'GMAIL_APP')
    assert.equal(derived[0]!.oauth2?.tokenSecretId, 'GMAIL_TOKENS')
    assert.equal(derived[0]!.optional, true)
  })

  test('a hand-written declaration wins, so an author keeps their own copy', () => {
    const derived = deriveOAuth2AppSecrets(
      [oauthCredential('gmailOAuth', 'GMAIL_APP')] as CredentialDefinitions,
      [
        {
          name: 'gmailApp',
          displayName: 'Mine',
          secretId: 'GMAIL_APP',
        },
      ] as any
    )

    assert.deepEqual(derived, [])
  })

  test('a credential with no OAuth2 implies nothing', () => {
    const derived = deriveOAuth2AppSecrets(
      [
        { name: 'apiKey', displayName: 'API Key', type: 'wire' },
      ] as CredentialDefinitions,
      []
    )

    assert.deepEqual(derived, [])
  })

  test('two credentials sharing one app secret imply it once', () => {
    const derived = deriveOAuth2AppSecrets(
      [
        oauthCredential('gmailOAuth', 'GOOGLE_APP'),
        oauthCredential('driveOAuth', 'GOOGLE_APP'),
      ] as CredentialDefinitions,
      []
    )

    assert.equal(derived.length, 1)
  })
})
