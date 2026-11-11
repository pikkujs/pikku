import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resolveDeploy } from './resolve-deploy.js'
import { planBackendDeploys } from '../functions/commands/deploy-backends.js'
import { resolveProvider } from '../functions/commands/deploy-apply.js'

const byTag = {
  strategy: 'function' as const,
  rules: [{ unit: 'pdf', tags: ['pdf'] }],
}

const config = {
  rootDir: '/proj',
  outDir: '/proj/.pikku',
  deploy: {
    provider: 'cloudflare',
    target: 'serverless' as const,
    bundler: 'esbuild' as const,
    serverlessIncompatible: ['metaService'],
  },
  backends: {
    app: { filter: {}, deploy: { grouping: byTag, embed: { db: 'data/db' } } },
    worker: {
      filter: {},
      deploy: { provider: 'standalone', target: 'server' as const },
    },
  },
  frontends: {
    web: { deploy: { provider: 'bunny' } },
    docs: {},
    off: { deploy: false },
  },
}

describe('resolveDeploy', () => {
  test('a backend with no override takes the project defaults', () => {
    const resolved = resolveDeploy(config, { backend: 'app' })
    assert.equal(resolved.provider, 'cloudflare')
    assert.equal(resolved.target, 'serverless')
    assert.equal(resolved.bundler, 'esbuild')
    assert.deepEqual(resolved.serverlessIncompatible, ['metaService'])
  })

  test('a backend overrides provider and target', () => {
    const resolved = resolveDeploy(config, { backend: 'worker' })
    assert.equal(resolved.provider, 'standalone')
    assert.equal(resolved.target, 'server')
    assert.equal(resolved.bundler, 'esbuild')
  })

  test('grouping and embed belong to the backend that sets them', () => {
    assert.deepEqual(resolveDeploy(config, { backend: 'app' }).grouping, byTag)
    assert.deepEqual(resolveDeploy(config, { backend: 'app' }).embed, {
      db: 'data/db',
    })
    assert.equal(
      resolveDeploy(config, { backend: 'worker' }).grouping,
      undefined
    )
    assert.equal(resolveDeploy(config, { backend: 'worker' }).embed, undefined)
  })

  test('a frontend overrides the provider, or inherits it', () => {
    assert.equal(resolveDeploy(config, { frontend: 'web' }).provider, 'bunny')
    assert.equal(
      resolveDeploy(config, { frontend: 'docs' }).provider,
      'cloudflare'
    )
    assert.equal(
      resolveDeploy(config, { frontend: 'off' }).provider,
      'cloudflare'
    )
  })

  test('the target defaults to serverless for a named provider', () => {
    assert.equal(
      resolveDeploy(
        { deploy: { provider: 'cloudflare' }, backends: { a: {} } },
        { backend: 'a' }
      ).target,
      'serverless'
    )
  })

  test('--provider beats the override and the default', () => {
    assert.equal(
      resolveDeploy(config, { backend: 'worker' }, 'azure').provider,
      'azure'
    )
  })
})

describe('a project that names no provider', () => {
  const bare = { backends: { app: { filter: {} } } }

  test('deploys with standalone on the server target, never cloudflare', () => {
    const resolved = resolveDeploy(bare, { backend: 'app' })
    assert.equal(resolved.provider, 'standalone')
    assert.equal(resolved.target, 'server')
  })

  test('a backend override still beats the default', () => {
    const own = { backends: { app: { deploy: { provider: 'cloudflare' } } } }
    const resolved = resolveDeploy(own, { backend: 'app' })
    assert.equal(resolved.provider, 'cloudflare')
    assert.equal(resolved.target, 'serverless')
  })

  test('-p beats the default', () => {
    assert.equal(
      resolveDeploy(bare, { backend: 'app' }, 'azure').provider,
      'azure'
    )
  })

  test('resolveProvider with no name loads standalone', async () => {
    await assert.rejects(
      resolveProvider(
        { deploy: { providers: { standalone: '@x/absent' } } },
        undefined
      ),
      /@x\/absent' is not installed/
    )
  })
})

describe('planBackendDeploys', () => {
  test('plans every declared backend, each with its own provider and grouping', () => {
    const plans = planBackendDeploys(config, {})
    assert.deepEqual(
      plans.map((p) => [p.name, p.providerName]),
      [
        ['app', 'cloudflare'],
        ['worker', 'standalone'],
      ]
    )
    assert.deepEqual(plans[0]!.resolved.grouping, byTag)
    assert.equal(plans[1]!.resolved.grouping, undefined)
    assert.equal(plans[0]!.backendDir, '/proj/.pikku/backends/app')
    assert.equal(plans[0]!.deployDir, '/proj/.deploy/app')
    assert.equal(plans[1]!.deployDir, '/proj/.deploy/worker')
  })

  test('--backend narrows the run', () => {
    const plans = planBackendDeploys(config, { backend: 'worker' })
    assert.deepEqual(
      plans.map((p) => p.name),
      ['worker']
    )
  })

  test('a lone backend deploys to .deploy itself', () => {
    const plans = planBackendDeploys(
      { ...config, backends: { app: config.backends.app } },
      {}
    )
    assert.equal(plans[0]!.deployDir, '/proj/.deploy')
    assert.equal(plans[0]!.many, false)
  })

  test('a backend without a provider plans as standalone', () => {
    const plans = planBackendDeploys(
      { ...config, deploy: { ...config.deploy, provider: undefined } },
      {}
    )
    assert.deepEqual(
      plans.map((p) => [p.name, p.providerName]),
      [
        ['app', 'standalone'],
        ['worker', 'standalone'],
      ]
    )
  })

  test('an unknown --backend names the declared ones', () => {
    assert.throws(
      () => planBackendDeploys(config, { backend: 'nope' }),
      /Declared backends: app, worker/
    )
  })
})
