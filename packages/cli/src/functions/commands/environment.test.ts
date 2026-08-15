import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resolveEnvironment } from './environment.js'

const environments = {
  local: {
    apiUrl: 'http://localhost:4077',
    appUrl: 'http://localhost:5001',
    signInPath: '/auth/sign-in/actor',
    rpcPath: '/rpc',
  },
}

describe('resolveEnvironment', () => {
  test('an unknown environment names the ones that are configured', () => {
    assert.throws(
      () => resolveEnvironment({ environment: 'staging', environments }),
      /Unknown environment 'staging'[\s\S]*Configured environments: local/
    )
  })

  test('an unknown environment with nothing configured shows what to add', () => {
    assert.throws(
      () => resolveEnvironment({ environment: 'staging', environments: {} }),
      /Add environments to pikku.config.json/
    )
  })

  test('without overrides the configured environment is used verbatim', () => {
    assert.deepEqual(
      resolveEnvironment({ environment: 'local', environments }),
      environments.local
    )
  })

  test('overrides replace the urls a run targets and leave the rest of the environment alone', () => {
    const env = resolveEnvironment({
      environment: 'local',
      environments,
      apiUrl: 'https://sandbox-a1b2.example.com/api',
      appUrl: 'https://sandbox-a1b2.example.com',
    })

    assert.deepEqual(env, {
      apiUrl: 'https://sandbox-a1b2.example.com/api',
      appUrl: 'https://sandbox-a1b2.example.com',
      signInPath: '/auth/sign-in/actor',
      rpcPath: '/rpc',
    })
  })

  test('the environment must still exist — the flags override it, they do not invent one', () => {
    assert.throws(
      () =>
        resolveEnvironment({
          environment: 'sandbox',
          environments,
          apiUrl: 'https://sandbox-a1b2.example.com/api',
        }),
      /Unknown environment 'sandbox'/
    )
  })

  test('an appUrl override alone leaves the configured apiUrl in place', () => {
    const env = resolveEnvironment({
      environment: 'local',
      environments,
      appUrl: 'https://sandbox-a1b2.example.com',
    })

    assert.equal(env.apiUrl, 'http://localhost:4077')
    assert.equal(env.appUrl, 'https://sandbox-a1b2.example.com')
  })

  test('a relative --api-url is rejected where it was typed, not deep in the run', () => {
    assert.throws(
      () =>
        resolveEnvironment({
          environment: 'local',
          environments,
          apiUrl: '/api',
        }),
      /--api-url '\/api' is not a valid absolute URL/
    )
  })

  test('a non-http --app-url is rejected', () => {
    assert.throws(
      () =>
        resolveEnvironment({
          environment: 'local',
          environments,
          appUrl: 'ftp://example.com',
        }),
      /--app-url 'ftp:\/\/example.com' must be an http\(s\) URL/
    )
  })

  test('--spawn against a remote --api-url is refused rather than binding a server nobody reaches', () => {
    assert.throws(
      () =>
        resolveEnvironment({
          environment: 'local',
          environments,
          apiUrl: 'https://sandbox-a1b2.example.com/api',
          spawn: true,
        }),
      /--spawn starts a server on this machine, but --api-url points at 'sandbox-a1b2.example.com'/
    )
  })

  test('--spawn with a local --api-url is a port override, and stands', () => {
    const env = resolveEnvironment({
      environment: 'local',
      environments,
      apiUrl: 'http://localhost:5555',
      spawn: true,
    })

    assert.equal(env.apiUrl, 'http://localhost:5555')
  })

  test('--spawn does not object to an --app-url elsewhere: the frontend need not be the spawned server', () => {
    const env = resolveEnvironment({
      environment: 'local',
      environments,
      appUrl: 'https://preview-a1b2.example.com',
      spawn: true,
    })

    assert.equal(env.appUrl, 'https://preview-a1b2.example.com')
  })
})
