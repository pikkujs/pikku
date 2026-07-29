import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { browserConfigFromEnv } from './config.js'

describe('browserConfigFromEnv', () => {
  test('an explicit override wins and is reported as one', () => {
    const config = browserConfigFromEnv(
      { appUrl: 'https://app.example.com' },
      { APP_URL: 'https://ignored.example.com' }
    )

    assert.equal(config.appUrl, 'https://app.example.com')
    assert.equal(config.appUrlSource, 'override')
  })

  test('a sandbox hostname known only at run time resolves the app url', () => {
    const config = browserConfigFromEnv(
      {},
      { SANDBOX_HOSTNAME: 'sandbox-a1b2.example.com' }
    )

    assert.equal(config.appUrl, 'https://sandbox-a1b2.example.com')
    assert.equal(config.appUrlSource, 'env')
    assert.equal(config.hostnameOnly, 'sandbox-a1b2.example.com')
  })

  test('E2E_APP_URL and APP_URL are env resolutions, not defaults', () => {
    assert.equal(
      browserConfigFromEnv({}, { E2E_APP_URL: 'https://e2e.example.com' })
        .appUrlSource,
      'env'
    )
    assert.equal(
      browserConfigFromEnv({}, { APP_URL: 'https://app.example.com' })
        .appUrlSource,
      'env'
    )
  })

  test('with nothing to go on the local fallback is marked as the placeholder it is', () => {
    const config = browserConfigFromEnv({}, {})

    assert.equal(config.appUrl, 'http://localhost:5001')
    assert.equal(config.appUrlSource, 'default')
  })

  test('the api url still defaults to the resolved app origin', () => {
    const config = browserConfigFromEnv(
      {},
      { SANDBOX_HOSTNAME: 'sandbox-a1b2.example.com' }
    )

    assert.equal(config.apiUrl, 'https://sandbox-a1b2.example.com/api')
  })
})
