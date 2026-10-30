import assert from 'node:assert'
import { describe, test } from 'node:test'
import {
  fetchOpenAPIRegistryEntry,
  openAPIRegistryName,
  registryAuthMode,
} from './openapi-registry.js'

const nothingExists = () => false

describe('openAPIRegistryName', () => {
  test('a catalogue name is a registry name', () => {
    assert.strictEqual(
      openAPIRegistryName(
        'amazonaws.com:applicationcostprofiler',
        nothingExists
      ),
      'amazonaws.com:applicationcostprofiler'
    )
    assert.strictEqual(
      openAPIRegistryName('stripe.com', nothingExists),
      'stripe.com'
    )
  })

  test('a URL is a spec', () => {
    assert.strictEqual(
      openAPIRegistryName('https://example.com/openapi.json', nothingExists),
      undefined
    )
  })

  test('a path is a spec, even one that does not exist', () => {
    for (const source of ['./spec.json', 'specs/api', 'C:\\specs\\api']) {
      assert.strictEqual(openAPIRegistryName(source, nothingExists), undefined)
    }
  })

  test('a spec file name is a spec, even one that does not exist', () => {
    for (const source of ['spec.json', 'spec.yaml', 'spec.YML']) {
      assert.strictEqual(openAPIRegistryName(source, nothingExists), undefined)
    }
  })

  test('a bare name that exists on disk is a spec', () => {
    assert.strictEqual(
      openAPIRegistryName('stripe.com', () => true),
      undefined
    )
  })
})

const answer =
  (status: number, body: string): typeof fetch =>
  async () =>
    new Response(body, { status })

const entry = {
  name: 'amazonaws.com:applicationcostprofiler',
  title: 'AWS Application Cost Profiler',
  version: '2020-09-10',
  swaggerUrl:
    'https://api.apis.guru/v2/specs/amazonaws.com/applicationcostprofiler/2020-09-10/openapi.json',
}

describe('fetchOpenAPIRegistryEntry', () => {
  test('asks the registry for the encoded name and returns the entry', async () => {
    let asked = ''
    const result = await fetchOpenAPIRegistryEntry(
      'https://registry.example.com',
      entry.name,
      async (url) => {
        asked = String(url)
        return new Response(JSON.stringify(entry))
      }
    )
    assert.strictEqual(
      asked,
      'https://registry.example.com/registry/openapis/amazonaws.com%3Aapplicationcostprofiler'
    )
    assert.strictEqual(result.swaggerUrl, entry.swaggerUrl)
  })

  test('refuses a name answered with an empty body', async () => {
    await assert.rejects(
      fetchOpenAPIRegistryEntry(
        'https://registry.example.com',
        'nope.com',
        answer(200, '')
      ),
      /nope\.com is not a file, and the registry at https:\/\/registry\.example\.com has no OpenAPI by that name/
    )
  })

  test('refuses a name answered with 404', async () => {
    await assert.rejects(
      fetchOpenAPIRegistryEntry(
        'https://registry.example.com',
        'nope.com',
        answer(404, 'not found')
      ),
      /has no OpenAPI by that name/
    )
  })

  test('refuses an entry that carries no swaggerUrl', async () => {
    await assert.rejects(
      fetchOpenAPIRegistryEntry(
        'https://registry.example.com',
        'nope.com',
        answer(200, JSON.stringify({ name: 'nope.com' }))
      ),
      /has no OpenAPI by that name/
    )
  })

  test('reports a registry failure with its status', async () => {
    await assert.rejects(
      fetchOpenAPIRegistryEntry(
        'https://registry.example.com',
        entry.name,
        answer(503, 'upstream unavailable')
      ),
      /answered 503 upstream unavailable/
    )
  })

  test('reports an unreachable registry', async () => {
    await assert.rejects(
      fetchOpenAPIRegistryEntry(
        'https://registry.example.com',
        entry.name,
        async () => {
          throw new Error('getaddrinfo ENOTFOUND')
        }
      ),
      /could not be reached: getaddrinfo ENOTFOUND/
    )
  })
})

describe('registryAuthMode', () => {
  test('a public API is none', () => {
    assert.strictEqual(registryAuthMode({ authType: 'none' }), 'none')
  })

  test('a key every user brings is user', () => {
    for (const authType of ['api_key', 'bearer', 'basic']) {
      assert.strictEqual(registryAuthMode({ authType, perUser: true }), 'user')
    }
  })

  test('a key the app holds is shared', () => {
    for (const authType of ['api_key', 'bearer', 'basic']) {
      assert.strictEqual(
        registryAuthMode({ authType, perUser: false }),
        'shared'
      )
    }
  })

  test('OAuth is always user, even when the registry says it is not per user', () => {
    assert.strictEqual(
      registryAuthMode({ authType: 'oauth2', perUser: false }),
      'user'
    )
    assert.strictEqual(
      registryAuthMode({ authType: 'oauth2', perUser: true }),
      'user'
    )
  })

  test('an unknown, custom or missing auth type is user', () => {
    for (const authType of ['unknown', 'custom', undefined]) {
      assert.strictEqual(registryAuthMode({ authType, perUser: false }), 'user')
    }
  })
})
