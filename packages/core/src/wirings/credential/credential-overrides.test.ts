import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCredentialResolutions,
  credentialOverrideAliases,
} from './credential-overrides.js'

describe('credentialOverrideAliases', () => {
  test('keeps the string form as a rename', () => {
    assert.deepEqual(credentialOverrideAliases({ gmailOAuth: 'GMAIL_TEAM' }), {
      gmailOAuth: 'GMAIL_TEAM',
    })
  })

  test('takes the rename out of the object form', () => {
    assert.deepEqual(
      credentialOverrideAliases({
        gmailOAuth: { name: 'GMAIL_TEAM', mode: 'wire' },
      }),
      { gmailOAuth: 'GMAIL_TEAM' }
    )
  })

  test('a mode-only override renames nothing', () => {
    assert.deepEqual(
      credentialOverrideAliases({ gmailOAuth: { mode: 'wire' } }),
      {}
    )
  })
})

describe('buildCredentialResolutions', () => {
  const declared = {
    gmailOAuth: { type: 'singleton' },
    slack: { type: 'wire' },
  }

  test('keeps what the addon declared when nothing overrides it', () => {
    assert.deepEqual(buildCredentialResolutions(declared, undefined), {
      gmailOAuth: { mode: 'singleton' },
      slack: { mode: 'wire' },
    })
  })

  test('lets the wiring make a declared singleton per-user', () => {
    const resolutions = buildCredentialResolutions(declared, {
      gmailOAuth: { mode: 'wire' },
    })
    assert.deepEqual(resolutions.gmailOAuth, { mode: 'wire' })
  })

  test('keys the resolution by the renamed credential', () => {
    const resolutions = buildCredentialResolutions(declared, {
      gmailOAuth: { name: 'GMAIL_SUPPORT', mode: 'singleton' },
    })
    assert.deepEqual(resolutions.GMAIL_SUPPORT, { mode: 'singleton' })
    assert.equal(resolutions.gmailOAuth, undefined)
  })

  test('an undeclared credential defaults to per-user', () => {
    const resolutions = buildCredentialResolutions(null, {
      stripe: { name: 'STRIPE_LIVE' },
    })
    assert.deepEqual(resolutions.STRIPE_LIVE, { mode: 'wire' })
  })

  test('refuses two credentials that collapse onto one name with opposite modes', () => {
    assert.throws(
      () =>
        buildCredentialResolutions(declared, {
          gmailOAuth: { name: 'SHARED', mode: 'singleton' },
          slack: { name: 'SHARED', mode: 'wire' },
        }),
      /both resolve to 'SHARED'/
    )
  })

  test('refuses the collision whichever declaration comes first', () => {
    assert.throws(
      () =>
        buildCredentialResolutions(declared, {
          slack: { name: 'SHARED', mode: 'wire' },
          gmailOAuth: { name: 'SHARED', mode: 'singleton' },
        }),
      /both resolve to 'SHARED'/
    )
  })

  test('allows a collision when both declarations agree on the mode', () => {
    const resolutions = buildCredentialResolutions(declared, {
      gmailOAuth: { name: 'SHARED', mode: 'wire' },
      slack: { name: 'SHARED', mode: 'wire' },
    })
    assert.deepEqual(resolutions.SHARED, { mode: 'wire' })
  })
})
