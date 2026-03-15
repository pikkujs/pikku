import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { computeContractHash } from './parse-openapi.js'
import type { ParsedSpec } from './parse-openapi.js'

function makeSpec(overrides: Partial<ParsedSpec> = {}): ParsedSpec {
  return {
    info: { title: 'Test API', version: '1.0.0' },
    baseUrl: 'https://api.example.com',
    serverUrls: ['https://api.example.com'],
    authType: 'bearer',
    operations: [
      {
        method: 'get',
        path: '/users/{id}',
        tags: [],
        pathParams: [
          { name: 'id', required: true, schema: { type: 'string' } },
        ],
        queryParams: [],
        headerParams: [],
        responseSchema: {
          type: 'object',
          properties: { id: { type: 'string' }, name: { type: 'string' } },
        },
        errorResponses: [{ statusCode: 404, description: 'Not found' }],
        deprecated: false,
      },
    ],
    componentSchemas: {
      User: {
        type: 'object',
        properties: { id: { type: 'string' }, name: { type: 'string' } },
      },
    },
    securitySchemes: {},
    tagDescriptions: {},
    ...overrides,
  }
}

describe('computeContractHash', () => {
  test('returns a 16-char hex string', () => {
    const hash = computeContractHash(makeSpec())
    assert.match(hash, /^[0-9a-f]{16}$/)
  })

  test('is stable for the same spec', () => {
    const spec = makeSpec()
    assert.strictEqual(computeContractHash(spec), computeContractHash(spec))
  })

  test('changes when a path is added', () => {
    const base = makeSpec()
    const modified = makeSpec({
      operations: [
        ...base.operations,
        {
          method: 'post',
          path: '/users',
          tags: [],
          pathParams: [],
          queryParams: [],
          headerParams: [],
          requestBody: {
            type: 'object',
            properties: { name: { type: 'string' } },
          },
          requestBodyRequired: true,
          errorResponses: [],
          deprecated: false,
        },
      ],
    })
    assert.notStrictEqual(
      computeContractHash(base),
      computeContractHash(modified)
    )
  })

  test('changes when a schema changes', () => {
    const base = makeSpec()
    const modified = makeSpec({
      componentSchemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
          },
        },
      },
    })
    assert.notStrictEqual(
      computeContractHash(base),
      computeContractHash(modified)
    )
  })

  test('does not change when only presentation fields differ', () => {
    const base = makeSpec()
    const sameContract = makeSpec({
      info: { title: 'Renamed API', version: '2.0.0', description: 'New desc' },
      tagDescriptions: { users: 'User management' },
      operations: base.operations.map((op) => ({
        ...op,
        summary: 'Get a user by ID',
        description: 'Retrieves a single user resource',
        operationId: 'getUserById',
        tags: ['users'],
      })),
    })
    assert.strictEqual(
      computeContractHash(base),
      computeContractHash(sameContract)
    )
  })

  test('changes when server URLs change', () => {
    const base = makeSpec()
    const modified = makeSpec({
      serverUrls: ['https://api-v2.example.com'],
    })
    assert.notStrictEqual(
      computeContractHash(base),
      computeContractHash(modified)
    )
  })

  test('changes when security schemes change', () => {
    const base = makeSpec()
    const modified = makeSpec({
      securitySchemes: {
        oauth2: {
          type: 'oauth2',
          flows: {
            authorizationUrl: 'https://auth.example.com/authorize',
            tokenUrl: 'https://auth.example.com/token',
            scopes: { read: 'Read access' },
          },
        },
      },
    })
    assert.notStrictEqual(
      computeContractHash(base),
      computeContractHash(modified)
    )
  })
})
