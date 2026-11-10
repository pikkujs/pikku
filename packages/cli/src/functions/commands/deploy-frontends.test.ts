import { afterEach, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  assertFrontendSupported,
  planBackendDeploys,
  planFrontendDeploys,
} from './deploy-backends.js'
import { deployApply } from './deploy-apply.js'
import { deployPlan } from './deploy-plan.js'

const base = {
  rootDir: '/proj',
  outDir: '/proj/.pikku',
  backends: { api: { filter: {} } },
}

const plan = (config: object, provider?: string) =>
  planFrontendDeploys(
    config as never,
    { provider },
    planBackendDeploys(config as never, { provider })
  )

const standalone = {
  name: 'standalone',
  frontends: { kinds: ['spa', 'static'], embedded: true },
} as never

describe('planFrontendDeploys', () => {
  test('a project naming no provider deploys frontends through standalone', () => {
    const plans = plan({
      ...base,
      frontends: { web: { dist: '/proj/dist', serve: {} } },
    })
    assert.deepEqual(
      plans.map((p) => [p.name, p.providerName, p.kind, p.embedded]),
      [['web', 'standalone', 'spa', true]]
    )
  })

  test('a frontend override beats the project default, -p beats both', () => {
    const config = {
      ...base,
      deploy: { provider: 'cloudflare' },
      frontends: { web: { deploy: { provider: 'bunny' } }, docs: {} },
    }
    assert.deepEqual(
      plan(config).map((p) => [p.name, p.providerName]),
      [
        ['web', 'bunny'],
        ['docs', 'cloudflare'],
      ]
    )
    assert.deepEqual(
      plan(config, 'standalone').map((p) => p.providerName),
      ['standalone', 'standalone']
    )
  })

  test('deploy: false leaves a frontend out', () => {
    const plans = plan({
      ...base,
      frontends: { web: {}, off: { deploy: false } },
    })
    assert.deepEqual(
      plans.map((p) => p.name),
      ['web']
    )
  })

  test('a serve frontend with a provider other than its backend is an error', () => {
    assert.throws(
      () =>
        plan({
          ...base,
          frontends: { web: { serve: {}, deploy: { provider: 'bunny' } } },
        }),
      /Frontend 'web' sets serve.*backend's provider \(standalone\).*'bunny'/
    )
  })

  test('a serve frontend naming its backend provider is fine', () => {
    assert.equal(
      plan({
        ...base,
        frontends: { web: { serve: {}, deploy: { provider: 'standalone' } } },
      }).length,
      1
    )
  })
})

describe('assertFrontendSupported', () => {
  const frontend = (kind: string, embedded: boolean) =>
    ({
      name: 'web',
      kind,
      embedded,
      providerName: 'standalone',
      dir: '',
    }) as never

  test('an embedded spa on standalone passes', () => {
    assertFrontendSupported(frontend('spa', true), standalone)
  })

  test('an ssr frontend on standalone fails with the exact message', () => {
    assert.throws(
      () => assertFrontendSupported(frontend('ssr', false), standalone),
      {
        message:
          "Frontend 'web' (kind ssr) cannot deploy to provider 'standalone': no ssr frontend support. Set frontends.web.deploy.provider to a provider that supports it, or deploy: false.",
      }
    )
  })

  test('a provider declaring nothing supports no frontend', () => {
    assert.throws(
      () =>
        assertFrontendSupported(frontend('spa', true), {
          name: 'cloudflare',
        } as never),
      /no spa frontend support/
    )
  })

  test('a non-embedded frontend needs deployFrontend', () => {
    assert.throws(
      () => assertFrontendSupported(frontend('spa', false), standalone),
      /declares frontend support but does not implement deployFrontend/
    )
    assertFrontendSupported(frontend('spa', false), {
      ...standalone,
      deployFrontend: async () => {},
    } as never)
  })
})

describe('plan and apply fail before any build', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pikku-deploy-frontends-'))
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const providerUrl = () => {
    const file = join(root, 'provider.mjs')
    writeFileSync(
      file,
      `export const createAdapter = () => ({ name: 'standalone', deployDirName: 'standalone', singleUnit: true, supportedRuntimes: ['bun'], frontends: { kinds: ['spa', 'static'], embedded: true } })`
    )
    return pathToFileURL(file).href
  }

  for (const [label, command] of [
    ['plan', deployPlan],
    ['apply', deployApply],
  ] as const) {
    test(`${label} refuses an ssr frontend before reading the project`, async () => {
      let built = false
      await assert.rejects(
        command.func(
          {
            logger: { info() {}, warn() {}, error() {}, debug() {} },
            config: {
              rootDir: root,
              outDir: join(root, '.pikku'),
              deploy: { providers: { standalone: providerUrl() } },
              backends: { api: { filter: {} } },
              frontends: { web: { kind: 'ssr', dist: join(root, 'dist') } },
            },
            getInspectorState: async () => {
              built = true
              throw new Error('built')
            },
            bundler: {},
          } as never,
          {} as never,
          {} as never
        ),
        /Frontend 'web' \(kind ssr\) cannot deploy to provider 'standalone'/
      )
      assert.equal(built, false)
    })
  }
})

describe('a project with no backends', () => {
  test('plans only its frontends', () => {
    const plans = plan({
      rootDir: '/proj',
      outDir: '/proj/.pikku',
      frontends: { web: { dist: '/proj/dist' } },
    })
    assert.deepEqual(
      plans.map((p) => p.name),
      ['web']
    )
  })

  test('nothing to deploy when it declares neither or every frontend opts out', () => {
    const config = {
      rootDir: '/proj',
      outDir: '/proj/.pikku',
      frontends: { web: { dist: '/proj/dist', deploy: false } },
    }
    assert.deepEqual(planBackendDeploys(config as never, {}), [])
    assert.deepEqual(plan(config), [])
  })

  test('--backend names nothing', () => {
    assert.throws(
      () =>
        planBackendDeploys(
          { rootDir: '/proj', outDir: '/proj/.pikku' } as never,
          { backend: 'api' }
        ),
      /\(none\)/
    )
  })
})
