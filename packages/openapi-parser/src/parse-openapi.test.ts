import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { writeFile, rm, mkdtemp } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { computeContractHash, parseOpenAPISpec } from './parse-openapi.js'
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

describe('parseOpenAPISpec — Swagger 2.0', () => {
  const swagger2Spec = {
    swagger: '2.0',
    info: { title: 'Test API', version: '1.0.0' },
    host: 'api.example.com',
    basePath: '/v1',
    schemes: ['https'],
    definitions: {
      Pet: {
        type: 'object',
        required: ['name'],
        properties: {
          id: { type: 'integer', format: 'int64' },
          name: { type: 'string' },
          status: { type: 'string', enum: ['available', 'sold'], description: 'pet status' },
        },
      },
    },
    securityDefinitions: {
      api_key: { type: 'apiKey', name: 'api_key', in: 'header' },
    },
    paths: {
      '/pets': {
        get: {
          operationId: 'listPets',
          summary: 'List all pets',
          parameters: [
            { in: 'query', name: 'status', type: 'string', description: 'Filter by status' },
          ],
          responses: {
            '200': {
              description: 'A list of pets',
              schema: { type: 'array', items: { $ref: '#/definitions/Pet' } },
            },
          },
        },
        post: {
          operationId: 'createPet',
          summary: 'Create a pet',
          parameters: [
            {
              in: 'body',
              name: 'body',
              description: 'Pet to create',
              required: true,
              schema: { $ref: '#/definitions/Pet' },
            },
          ],
          responses: {
            '201': {
              description: 'Created',
              schema: { $ref: '#/definitions/Pet' },
            },
            '400': { description: 'Bad request' },
          },
        },
      },
      '/pets/{petId}': {
        get: {
          operationId: 'getPet',
          parameters: [
            { in: 'path', name: 'petId', type: 'integer', required: true },
          ],
          responses: {
            '200': {
              description: 'A pet',
              schema: { $ref: '#/definitions/Pet' },
            },
          },
        },
      },
    },
  }

  let tmpDir: string
  let specPath: string

  test('setup', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'openapi-test-'))
    specPath = join(tmpDir, 'spec.json')
    await writeFile(specPath, JSON.stringify(swagger2Spec))
  })

  test('extracts component schemas from definitions', async () => {
    const spec = await parseOpenAPISpec(specPath)
    assert.ok(spec.componentSchemas.Pet)
    assert.equal(spec.componentSchemas.Pet.type, 'object')
    assert.ok(spec.componentSchemas.Pet.properties?.name)
  })

  test('extracts server URLs from host/basePath/schemes', async () => {
    const spec = await parseOpenAPISpec(specPath)
    assert.deepEqual(spec.serverUrls, ['https://api.example.com/v1'])
  })

  test('detects apiKey auth from securityDefinitions', async () => {
    const spec = await parseOpenAPISpec(specPath)
    assert.equal(spec.authType, 'apiKey')
  })

  test('extracts requestBody from body parameter', async () => {
    const spec = await parseOpenAPISpec(specPath)
    const createPet = spec.operations.find(op => op.operationId === 'createPet')
    assert.ok(createPet?.requestBody)
    assert.equal(createPet.requestBody.type, 'object')
    assert.ok(createPet.requestBody.properties?.name)
    assert.equal(createPet.requestBodyRequired, true)
    assert.equal(createPet.requestBodyDescription, 'Pet to create')
  })

  test('extracts responseSchema from Swagger 2.0 response', async () => {
    const spec = await parseOpenAPISpec(specPath)
    const createPet = spec.operations.find(op => op.operationId === 'createPet')
    assert.ok(createPet?.responseSchema)
    assert.equal(createPet.responseSchema.type, 'object')

    const listPets = spec.operations.find(op => op.operationId === 'listPets')
    assert.ok(listPets?.responseSchema)
    assert.equal(listPets.responseSchema.type, 'array')
  })

  test('extracts query params', async () => {
    const spec = await parseOpenAPISpec(specPath)
    const listPets = spec.operations.find(op => op.operationId === 'listPets')
    assert.equal(listPets?.queryParams.length, 1)
    assert.equal(listPets?.queryParams[0].name, 'status')
  })

  test('extracts path params', async () => {
    const spec = await parseOpenAPISpec(specPath)
    const getPet = spec.operations.find(op => op.operationId === 'getPet')
    assert.equal(getPet?.pathParams.length, 1)
    assert.equal(getPet?.pathParams[0].name, 'petId')
    assert.equal(getPet?.pathParams[0].required, true)
  })

  test('extracts error responses', async () => {
    const spec = await parseOpenAPISpec(specPath)
    const createPet = spec.operations.find(op => op.operationId === 'createPet')
    assert.equal(createPet?.errorResponses.length, 1)
    assert.equal(createPet?.errorResponses[0].statusCode, 400)
  })

  test('cleanup', async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })
})
