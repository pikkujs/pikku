import { afterEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { setDefaultHostResolver } from './default-host-resolver.js'
import * as safeFetchModule from './safe-fetch.js'
import { safeFetch } from './safe-fetch.js'

describe('default host resolver', () => {
  afterEach(() => setDefaultHostResolver(undefined))

  test('./safe-fetch does not export the setter', () => {
    assert.equal('setDefaultHostResolver' in safeFetchModule, false)
  })

  test('the installed resolver guards a call that passes none', async () => {
    const realFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      return new Response('ok')
    }) as typeof fetch
    try {
      setDefaultHostResolver(async () => ['169.254.169.254'])
      await assert.rejects(
        safeFetch('https://169-254-169-254.nip.io/latest/meta-data/'),
        /resolves to 169\.254\.169\.254/
      )
      assert.equal(calls, 0)
    } finally {
      globalThis.fetch = realFetch
    }
  })
})
