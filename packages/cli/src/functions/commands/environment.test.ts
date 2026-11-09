import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  apiUrlPort,
  DEFAULT_DEV_PORT,
  isLocalUrl,
  resolveDevEnvironmentName,
  resolveDevPort,
  resolveEnvironment,
} from './environment.js'

const env = (
  url: string,
  extra: { production?: boolean; frontends?: Record<string, string> } = {}
) => ({
  backends: { api: { url } },
  frontends: extra.frontends ?? {},
  ...(extra.production ? { production: true } : {}),
})

const environments = {
  local: {
    backends: {
      api: {
        url: 'http://localhost:4077',
        signInPath: '/auth/sign-in/virtual-user',
        rpcPath: '/rpc',
      },
    },
    frontends: { web: 'http://localhost:5001' },
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

  test('without overrides the only backend and frontend are the target', () => {
    assert.deepEqual(
      resolveEnvironment({ environment: 'local', environments }),
      {
        backend: 'api',
        apiUrl: 'http://localhost:4077',
        signInPath: '/auth/sign-in/virtual-user',
        rpcPath: '/rpc',
        appUrl: 'http://localhost:5001',
        appUrls: { web: 'http://localhost:5001' },
      }
    )
  })

  test('two backends need one named; the default is only the only one', () => {
    const two = {
      stage: {
        backends: {
          api: { url: 'https://api.test' },
          admin: { url: 'https://admin.test', signInPath: '/a/sign-in/x' },
        },
        frontends: {},
      },
    }
    assert.throws(
      () => resolveEnvironment({ environment: 'stage', environments: two }),
      /has 2 backends \(api, admin\)/
    )
    const picked = resolveEnvironment({
      environment: 'stage',
      environments: two,
      backend: 'admin',
    })
    assert.equal(picked.apiUrl, 'https://admin.test')
    assert.equal(picked.signInPath, '/a/sign-in/x')
    assert.throws(
      () =>
        resolveEnvironment({
          environment: 'stage',
          environments: two,
          backend: 'nope',
        }),
      /no backend 'nope'/
    )
  })

  test('several frontends fall back to the primary one', () => {
    const many = {
      stage: {
        backends: { api: { url: 'https://api.test' } },
        frontends: { web: 'https://web.test', admin: 'https://admin.test' },
      },
    }
    assert.equal(
      resolveEnvironment({ environment: 'stage', environments: many }).appUrl,
      undefined
    )
    assert.equal(
      resolveEnvironment({
        environment: 'stage',
        environments: many,
        primaryFrontend: 'admin',
      }).appUrl,
      'https://admin.test'
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
      backend: 'api',
      apiUrl: 'https://sandbox-a1b2.example.com/api',
      appUrl: 'https://sandbox-a1b2.example.com',
      appUrls: { web: 'http://localhost:5001' },
      signInPath: '/auth/sign-in/virtual-user',
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

  test('--app-url takes a url per app, so each virtual user browses their own', () => {
    const env = resolveEnvironment({
      environment: 'local',
      environments,
      appUrl:
        'workshop=https://host.test/,storefront=https://host.test/_frontend/storefront/',
    })

    assert.deepEqual(env.appUrls, {
      web: 'http://localhost:5001',
      workshop: 'https://host.test/',
      storefront: 'https://host.test/_frontend/storefront/',
    })
    assert.equal(
      env.appUrl,
      'http://localhost:5001',
      'the configured fallback stands for a virtual user naming no app'
    )
  })

  test('a bare url among the pairs is the fallback, not an app called nothing', () => {
    const env = resolveEnvironment({
      environment: 'local',
      environments,
      appUrl:
        'https://host.test/,storefront=https://host.test/_frontend/storefront/',
    })

    assert.equal(env.appUrl, 'https://host.test/')
    assert.deepEqual(env.appUrls, {
      web: 'http://localhost:5001',
      storefront: 'https://host.test/_frontend/storefront/',
    })
  })

  test("an app's url is checked like any other, and names the app when it is wrong", () => {
    assert.throws(
      () =>
        resolveEnvironment({
          environment: 'local',
          environments,
          appUrl: 'storefront=/_frontend/storefront/',
        }),
      /--app-url storefront '\/_frontend\/storefront\/' is not a valid absolute URL/
    )
  })
})

describe('resolveDevEnvironmentName', () => {
  test('a loopback environment is what dev runs as', () => {
    assert.equal(resolveDevEnvironmentName(environments), 'local')
  })

  test("'local' wins over another loopback environment", () => {
    assert.equal(
      resolveDevEnvironmentName({
        e2e: env('http://127.0.0.1:4078'),
        local: env('http://localhost:4077'),
      }),
      'local'
    )
  })

  test('a remote or production environment is never dev', () => {
    assert.equal(
      resolveDevEnvironmentName({
        staging: env('https://api.staging.test'),
        production: env('https://api.test', { production: true }),
      }),
      undefined
    )
  })

  test('no configured environments resolves to nothing rather than a guess', () => {
    assert.equal(resolveDevEnvironmentName({}), undefined)
  })
})

describe('isLocalUrl', () => {
  test('every loopback spelling is this machine', () => {
    for (const url of [
      'http://localhost:4077',
      'http://127.0.0.1:4077/api',
      'http://0.0.0.0:4077',
      'https://[::1]:4077',
    ]) {
      assert.equal(isLocalUrl(url), true, url)
    }
  })

  test('a remote host is not, however it is spelled', () => {
    for (const url of [
      'https://api.staging.test',
      'https://localhost.example.com',
      'http://10.0.0.5:4077',
    ]) {
      assert.equal(isLocalUrl(url), false, url)
    }
  })

  test('something that is not a URL is not this machine either', () => {
    assert.equal(isLocalUrl('/api'), false)
    assert.equal(isLocalUrl(''), false)
  })
})

describe('resolveDevPort', () => {
  test('an explicit --port wins over the local apiUrl', () => {
    assert.equal(resolveDevPort('4100', environments), 4100)
  })

  test('--port 0 is kept, so the OS can pick a free port', () => {
    assert.equal(resolveDevPort('0', environments), 0)
  })

  test("without --port the local environment's apiUrl port is used", () => {
    assert.equal(resolveDevPort(undefined, environments), 4077)
  })

  test('local is preferred over another loopback environment', () => {
    assert.equal(
      resolveDevPort(undefined, {
        e2e: env('http://localhost:5555'),
        local: env('http://127.0.0.1:4200'),
      }),
      4200
    )
  })

  test('a production or remote environment never sets the dev port', () => {
    assert.equal(
      resolveDevPort(undefined, {
        prod: env('http://localhost:8080', { production: true }),
        stage: env('https://stage.example.com:8443'),
      }),
      DEFAULT_DEV_PORT
    )
  })

  test('no configured environments falls back to 3000', () => {
    assert.equal(resolveDevPort(undefined, {}), 3000)
  })

  test('an apiUrl without a port means its scheme default, as callers will use it', () => {
    assert.equal(
      resolveDevPort(undefined, { local: env('http://localhost') }),
      80
    )
  })

  test('a --port that is not a port number is refused', () => {
    for (const bad of ['abc', '-1', '70000', '3.5']) {
      assert.throws(
        () => resolveDevPort(bad, environments),
        /is not a port number/,
        bad
      )
    }
  })
})

describe('apiUrlPort', () => {
  test('explicit port, then the scheme default', () => {
    assert.equal(apiUrlPort('http://localhost:4100/api'), 4100)
    assert.equal(apiUrlPort('http://localhost'), 80)
    assert.equal(apiUrlPort('https://localhost'), 443)
  })
})
