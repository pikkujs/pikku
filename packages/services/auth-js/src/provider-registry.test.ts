import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PROVIDER_REGISTRY } from './provider-registry.js'

describe('PROVIDER_REGISTRY', () => {
  test('standard OAuth providers do not have a variables field', () => {
    for (const name of [
      'github',
      'google',
      'discord',
      'twitter',
      'spotify',
      'reddit',
    ] as const) {
      assert.equal(
        PROVIDER_REGISTRY[name].variables,
        undefined,
        `${name} should not have a variables field`
      )
    }
  })

  test('auth0 has variables.issuer with variableId AUTH0_ISSUER', () => {
    const def = PROVIDER_REGISTRY['auth0']
    assert.ok(def.variables?.issuer, 'auth0 must have variables.issuer')
    assert.equal(def.variables!.issuer.variableId, 'AUTH0_ISSUER')
  })

  test('auth0 does not have issuer in fields (secret schema)', () => {
    assert.equal(
      PROVIDER_REGISTRY['auth0'].fields['issuer' as any],
      undefined,
      'issuer must not be in the secret schema — it is a variable, not a secret'
    )
  })

  test('okta has variables.issuer with variableId OKTA_ISSUER', () => {
    const def = PROVIDER_REGISTRY['okta']
    assert.ok(def.variables?.issuer, 'okta must have variables.issuer')
    assert.equal(def.variables!.issuer.variableId, 'OKTA_ISSUER')
  })

  test('azure-ad has variables.tenantId with variableId AZURE_AD_TENANT_ID', () => {
    const def = PROVIDER_REGISTRY['azure-ad']
    assert.ok(def.variables?.tenantId, 'azure-ad must have variables.tenantId')
    assert.equal(def.variables!.tenantId.variableId, 'AZURE_AD_TENANT_ID')
  })

  test('keycloak has variables.issuer', () => {
    const def = PROVIDER_REGISTRY['keycloak']
    assert.ok(def.variables?.issuer)
    assert.equal(def.variables!.issuer.variableId, 'KEYCLOAK_ISSUER')
  })

  test('cognito has variables.issuer', () => {
    const def = PROVIDER_REGISTRY['cognito']
    assert.ok(def.variables?.issuer)
    assert.equal(def.variables!.issuer.variableId, 'COGNITO_ISSUER')
  })

  test('microsoft-entra-id has variables.tenantId', () => {
    const def = PROVIDER_REGISTRY['microsoft-entra-id']
    assert.ok(def.variables?.tenantId)
    assert.equal(
      def.variables!.tenantId.variableId,
      'MICROSOFT_ENTRA_ID_TENANT_ID'
    )
  })

  test('all providers in registry have required fields', () => {
    for (const [name, def] of Object.entries(PROVIDER_REGISTRY)) {
      assert.ok(def.importPath, `${name} must have importPath`)
      assert.ok(def.importName, `${name} must have importName`)
      assert.ok(def.secretId, `${name} must have secretId`)
      assert.ok(def.fields.clientId, `${name} must have clientId in fields`)
      assert.ok(
        def.fields.clientSecret,
        `${name} must have clientSecret in fields`
      )
    }
  })

  test('new providers are present in the registry', () => {
    const expectedNewProviders = [
      'reddit',
      'notion',
      'instagram',
      'zoom',
      'figma',
      'tiktok',
      'threads',
      'patreon',
      'dropbox',
      'bitbucket',
      'hubspot',
      'salesforce',
      'atlassian',
      'strava',
      'keycloak',
      'cognito',
      'microsoft-entra-id',
    ]
    for (const name of expectedNewProviders) {
      assert.ok(
        PROVIDER_REGISTRY[name],
        `${name} should be present in the registry`
      )
    }
  })
})
