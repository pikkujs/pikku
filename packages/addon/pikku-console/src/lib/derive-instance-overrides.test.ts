import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { deriveInstanceOverrides, packageBase } from './derive-instance-overrides.js'

describe('deriveInstanceOverrides', () => {
  test('scopes an env secret by namespace, stripping a redundant package prefix', () => {
    const o = deriveInstanceOverrides('mandrill-promo', '@pikku/addon-mandrill', {
      secrets: ['MANDRILL_API_KEY'],
      variables: [],
      credentials: [],
    })
    assert.deepEqual(o.secretOverrides, {
      MANDRILL_API_KEY: 'MANDRILL_PROMO_API_KEY',
    })
  })

  test('prefixes a secret that does not start with the package base', () => {
    const o = deriveInstanceOverrides('acme-mail', '@pikku/addon-mandrill', {
      secrets: ['SMTP_PASSWORD'],
      variables: [],
      credentials: [],
    })
    assert.deepEqual(o.secretOverrides, {
      SMTP_PASSWORD: 'ACME_MAIL_SMTP_PASSWORD',
    })
  })

  test('scopes variables the same env-style way', () => {
    const o = deriveInstanceOverrides('gmail-support', '@pikku/addon-gmail', {
      secrets: [],
      variables: ['GMAIL_REGION'],
      credentials: [],
    })
    assert.deepEqual(o.variableOverrides, {
      GMAIL_REGION: 'GMAIL_SUPPORT_REGION',
    })
  })

  test('scopes credentials with the kebab namespace (providerId identity)', () => {
    const o = deriveInstanceOverrides('gmail-support', '@pikku/addon-gmail', {
      secrets: [],
      variables: [],
      credentials: ['gmailOAuth'],
    })
    assert.deepEqual(o.credentialOverrides, {
      gmailOAuth: 'gmail-support-gmailOAuth',
    })
  })

  test('omits override maps for kinds the addon declares none of', () => {
    const o = deriveInstanceOverrides('x-two', '@pikku/addon-x', {
      secrets: [],
      variables: [],
      credentials: [],
    })
    assert.deepEqual(o, {})
  })

  test('packageBase strips scope and addon- prefix', () => {
    assert.equal(packageBase('@pikku/addon-mandrill'), 'mandrill')
    assert.equal(packageBase('addon-slack'), 'slack')
    assert.equal(packageBase('mypkg'), 'mypkg')
  })
})
