import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  cloudSupportFor,
  entryToDeclaration,
  tierOfCloud,
  type CloudSupportData,
} from './cloudsupport.js'
import { CLOUDSUPPORT } from './cloudsupport.data.js'
import { resolvePackageTier } from './runtime-tier.js'

const data = (
  entries: CloudSupportData['packages'][string]
): CloudSupportData => ({ schemaVersion: 1, packages: { lib: entries } })

describe('tierOfCloud', () => {
  it('maps edge platforms, serverless and neither onto the tiers', () => {
    assert.equal(
      tierOfCloud({ edge: ['cloudflare-workers'], serverless: true }),
      'edge'
    )
    assert.equal(tierOfCloud({ edge: false, serverless: true }), 'serverless')
    assert.equal(tierOfCloud({ edge: false, serverless: false }), 'server')
  })
})

describe('cloudSupportFor', () => {
  const lib = data([
    { versions: '<2', cloud: { edge: false, serverless: true } },
    {
      versions: '>=2',
      cloud: { edge: ['cloudflare-workers'], serverless: true },
    },
  ])

  it('picks the entry whose range holds the installed version', () => {
    assert.equal(
      cloudSupportFor(lib, 'lib', '1.9.0')?.declaration.runtime,
      'serverless'
    )
    assert.equal(
      cloudSupportFor(lib, 'lib', '2.0.0')?.declaration.runtime,
      'edge'
    )
  })

  it('matches a prerelease of an in-range version', () => {
    assert.equal(
      cloudSupportFor(lib, 'lib', '1.5.0-beta.1')?.declaration.runtime,
      'serverless'
    )
  })

  it('says nothing for a package or version the data does not cover', () => {
    assert.equal(cloudSupportFor(lib, 'other', '1.0.0'), undefined)
    assert.equal(
      cloudSupportFor(
        data([{ versions: '>=5', cloud: { edge: false, serverless: true } }]),
        'lib',
        '1.0.0'
      ),
      undefined
    )
  })

  it('matches an unknown version only against a "*" entry', () => {
    assert.equal(cloudSupportFor(lib, 'lib', undefined), undefined)
    assert.equal(cloudSupportFor(lib, 'lib', 'workspace:*'), undefined)
    const star = data([
      { versions: '*', cloud: { edge: false, serverless: true } },
    ])
    assert.equal(
      cloudSupportFor(star, 'lib', undefined)?.declaration.runtime,
      'serverless'
    )
  })

  it('names where the tier came from', () => {
    assert.equal(
      cloudSupportFor(lib, 'lib', '1.0.0')?.source,
      'cloudsupport lib@<2'
    )
  })
})

describe('entryToDeclaration', () => {
  it('carries per-subpath overrides', () => {
    const declaration = entryToDeclaration({
      versions: '*',
      cloud: { edge: false, serverless: false },
      exports: {
        './fetch': {
          cloud: { edge: ['cloudflare-workers'], serverless: true },
        },
      },
    })
    assert.equal(resolvePackageTier(declaration).tier, 'server')
    assert.equal(resolvePackageTier(declaration, './fetch').tier, 'edge')
  })
})

describe('the vendored cloudsupport data', () => {
  const tier = (name: string, subpath?: string, version = '0.12.0') => {
    const match = cloudSupportFor(CLOUDSUPPORT, name, version)
    assert.ok(match, `${name}@${version} is covered`)
    return resolvePackageTier(match.declaration, subpath).tier
  }

  it('has schemaVersion 1 and every entry converts to a tier', () => {
    assert.equal(CLOUDSUPPORT.schemaVersion, 1)
    for (const [name, entries] of Object.entries(CLOUDSUPPORT.packages)) {
      for (const entry of entries) {
        assert.ok(
          ['edge', 'serverless', 'server'].includes(
            entryToDeclaration(entry).runtime
          ),
          name
        )
      }
    }
  })

  it('keeps core edge with its Node-only subpaths on the server', () => {
    assert.equal(tier('@pikku/core'), 'edge')
    assert.equal(tier('@pikku/core', './services/local-meta'), 'server')
    assert.equal(tier('@pikku/core', './dev'), 'server')
  })

  it('keeps the other built-ins on the tiers they were verified at', () => {
    assert.equal(tier('@pikku/kysely'), 'edge')
    assert.equal(tier('@pikku/better-auth'), 'serverless')
    assert.equal(tier('@pikku/addon-console'), 'server')
    assert.equal(tier('@pikku/modelcontextprotocol'), 'server')
    assert.equal(tier('@pikku/modelcontextprotocol', './fetch'), 'edge')
  })

  it('gives every "no" a reason', () => {
    for (const [name, entries] of Object.entries(CLOUDSUPPORT.packages)) {
      for (const entry of entries) {
        const narrows =
          entry.cloud.edge === false ||
          !entry.cloud.serverless ||
          Object.values(entry.exports ?? {}).some(
            ({ cloud }) => cloud.edge === false || !cloud.serverless
          )
        if (narrows) assert.ok(entry.reason, `${name} needs a reason`)
      }
    }
  })
})
