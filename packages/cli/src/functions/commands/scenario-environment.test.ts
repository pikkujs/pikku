import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resolveScenarioEnvironment } from './scenario-environment.js'

const environments = {
  local: {
    apiUrl: 'http://localhost:4077',
    appUrl: 'http://localhost:5001',
    signInPath: '/auth/sign-in/actor',
    rpcPath: '/rpc',
  },
}

describe('resolveScenarioEnvironment', () => {
  test('an unknown environment names the ones that are configured', () => {
    assert.throws(
      () => resolveScenarioEnvironment({ environment: 'staging', environments }),
      /Unknown scenario environment 'staging'[\s\S]*Configured environments: local/
    )
  })

  test('an unknown environment with nothing configured shows what to add', () => {
    assert.throws(
      () =>
        resolveScenarioEnvironment({ environment: 'staging', environments: {} }),
      /Add scenarios.environments to pikku.config.json/
    )
  })

  test('without overrides the configured environment is used verbatim', () => {
    assert.deepEqual(
      resolveScenarioEnvironment({ environment: 'local', environments }),
      environments.local
    )
  })

  test('overrides replace the urls a run targets and leave the rest of the environment alone', () => {
    const env = resolveScenarioEnvironment({
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
        resolveScenarioEnvironment({
          environment: 'sandbox',
          environments,
          apiUrl: 'https://sandbox-a1b2.example.com/api',
        }),
      /Unknown scenario environment 'sandbox'/
    )
  })

  test('an appUrl override alone leaves the configured apiUrl in place', () => {
    const env = resolveScenarioEnvironment({
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
        resolveScenarioEnvironment({
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
        resolveScenarioEnvironment({
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
        resolveScenarioEnvironment({
          environment: 'local',
          environments,
          apiUrl: 'https://sandbox-a1b2.example.com/api',
          spawn: true,
        }),
      /--spawn starts a server on this machine, but --api-url points at 'sandbox-a1b2.example.com'/
    )
  })

  test('--spawn with a local --api-url is a port override, and stands', () => {
    const env = resolveScenarioEnvironment({
      environment: 'local',
      environments,
      apiUrl: 'http://localhost:5555',
      spawn: true,
    })

    assert.equal(env.apiUrl, 'http://localhost:5555')
  })

  test('--spawn does not object to an --app-url elsewhere: the frontend need not be the spawned server', () => {
    const env = resolveScenarioEnvironment({
      environment: 'local',
      environments,
      appUrl: 'https://preview-a1b2.example.com',
      spawn: true,
    })

    assert.equal(env.appUrl, 'https://preview-a1b2.example.com')
  })
})
