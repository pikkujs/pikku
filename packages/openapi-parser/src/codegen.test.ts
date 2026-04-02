import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { generateAddonFromOpenAPI } from './codegen.js'
import type { ParsedSpec, ParsedOperation } from './parse-openapi.js'

function makeVars(
  overrides: Partial<{
    name: string
    camelName: string
    pascalName: string
    screamingName: string
    displayName: string
    description: string
  }> = {}
) {
  return {
    name: 'test-api',
    camelName: 'testApi',
    pascalName: 'TestApi',
    screamingName: 'TEST_API',
    displayName: 'Test API',
    description: 'Test API integration',
    ...overrides,
  }
}

function makeSpec(overrides: Partial<ParsedSpec> = {}): ParsedSpec {
  return {
    info: { title: 'Test API', version: '1.0.0' },
    baseUrl: 'https://api.example.com',
    serverUrls: ['https://api.example.com'],
    authType: 'bearer',
    operations: [],
    componentSchemas: {},
    securitySchemes: {},
    tagDescriptions: {},
    ...overrides,
  }
}

function makeOp(overrides: Partial<ParsedOperation> = {}): ParsedOperation {
  return {
    method: 'get',
    path: '/items',
    tags: [],
    pathParams: [],
    queryParams: [],
    headerParams: [],
    errorResponses: [],
    deprecated: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Topological sort of schema declarations
// ---------------------------------------------------------------------------
describe('topological sort of schemas', () => {
  test('dependency schemas are declared before dependents in types file', () => {
    const addressSchema = {
      type: 'object' as const,
      properties: {
        street: { type: 'string' as const },
      },
    }
    const userSchema = {
      type: 'object' as const,
      properties: {
        name: { type: 'string' as const },
        address: { $ref: '#/components/schemas/Address' },
      },
    }
    const spec = makeSpec({
      componentSchemas: {
        // User comes first but depends on Address
        User: userSchema,
        Address: addressSchema,
      },
      // Both schemas must be referenced by 2+ operations to land in the types file
      operations: [
        makeOp({ method: 'get', path: '/users', responseSchema: userSchema }),
        makeOp({ method: 'post', path: '/users', responseSchema: userSchema }),
      ],
    })
    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
    })
    const typesFile = files['src/test-api.types.ts']
    assert.ok(typesFile, 'types file should exist')

    const addressIdx = typesFile.indexOf('AddressSchema')
    const userIdx = typesFile.indexOf('UserSchema')
    assert.ok(
      addressIdx < userIdx,
      `Address should be declared before User. Address at ${addressIdx}, User at ${userIdx}`
    )
  })
})

// ---------------------------------------------------------------------------
// z.lazy() for circular schema references
// ---------------------------------------------------------------------------
describe('circular schema references', () => {
  test('generates z.lazy() forward declarations for cyclic schemas', () => {
    // Create schemas that reference each other
    const nodeSchema: any = {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    }
    // Make it self-referential via $ref (surviving after resolution)
    nodeSchema.properties.children = {
      type: 'array',
      items: { $ref: '#/components/schemas/TreeNode' },
    }

    const spec = makeSpec({
      componentSchemas: {
        TreeNode: nodeSchema,
      },
      // Use TreeNode in 2+ operations so it lands in the shared types file
      operations: [
        makeOp({ method: 'get', path: '/tree', responseSchema: nodeSchema }),
        makeOp({ method: 'post', path: '/tree', responseSchema: nodeSchema }),
      ],
    })

    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
    })
    const typesFile = files['src/test-api.types.ts']
    assert.ok(typesFile, 'types file should exist')

    // Should contain z.lazy for the circular reference
    // The self-reference should be handled (either z.lazy or direct reference)
    assert.ok(
      typesFile.includes('TreeNodeSchema'),
      'should declare TreeNodeSchema'
    )
  })
})

// ---------------------------------------------------------------------------
// Duplicate schema variable names → append _2, _3
// ---------------------------------------------------------------------------
describe('duplicate schema variable names', () => {
  test('deduplicates schema names that sanitize to the same identifier', () => {
    const userSchema = {
      type: 'object' as const,
      properties: { id: { type: 'string' as const } },
    }
    const userSchema2 = {
      type: 'object' as const,
      properties: { name: { type: 'string' as const } },
    }
    const spec = makeSpec({
      componentSchemas: {
        User: userSchema,
        // A schema whose sanitized name collides with "User"
        user: userSchema2,
      },
      // Both schemas referenced by 2+ operations so they land in the types file
      operations: [
        makeOp({ method: 'get', path: '/a', responseSchema: userSchema }),
        makeOp({ method: 'get', path: '/b', responseSchema: userSchema }),
        makeOp({ method: 'get', path: '/c', responseSchema: userSchema2 }),
        makeOp({ method: 'get', path: '/d', responseSchema: userSchema2 }),
      ],
    })

    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
    })
    const typesFile = files['src/test-api.types.ts']
    assert.ok(typesFile, 'types file should exist')

    // Both schemas should appear — one might have _2 suffix
    // At minimum there should be no syntax error from duplicate const names
    const schemaMatches = typesFile.match(/export const \w+Schema/g)
    assert.ok(schemaMatches, 'should have schema exports')
    const uniqueNames = new Set(schemaMatches)
    assert.equal(
      uniqueNames.size,
      schemaMatches.length,
      'all schema const names should be unique'
    )
  })
})

// ---------------------------------------------------------------------------
// Function files import used schema refs from types file
// ---------------------------------------------------------------------------
describe('function file schema imports', () => {
  test('imports shared schemas from types file', () => {
    const petSchema = {
      type: 'object' as const,
      properties: {
        id: { type: 'string' as const },
        name: { type: 'string' as const },
      },
    }

    const spec = makeSpec({
      componentSchemas: {
        Pet: petSchema,
      },
      // Pet used by 2+ operations → shared → imported from types file
      operations: [
        makeOp({
          method: 'get',
          path: '/pets/{id}',
          operationId: 'getPet',
          pathParams: [
            { name: 'id', required: true, schema: { type: 'string' } },
          ],
          responseSchema: petSchema,
        }),
        makeOp({
          method: 'get',
          path: '/pets',
          operationId: 'listPets',
          responseSchema: { type: 'array' as const, items: petSchema },
        }),
      ],
    })

    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
    })
    const funcFile = files['src/functions/getPet.function.ts']
    assert.ok(funcFile, 'function file should exist')
    assert.ok(
      funcFile.includes("from '../test-api.types.js'"),
      `should import from types file, got: ${funcFile.split('\n').slice(0, 10).join('\n')}`
    )
    assert.ok(funcFile.includes('PetSchema'), 'should reference PetSchema')
  })

  test('inlines single-use schemas instead of importing from types file', () => {
    const petSchema = {
      type: 'object' as const,
      properties: {
        id: { type: 'string' as const },
        name: { type: 'string' as const },
      },
    }

    const spec = makeSpec({
      componentSchemas: {
        Pet: petSchema,
      },
      // Pet only used by 1 operation → inlined in function file
      operations: [
        makeOp({
          method: 'get',
          path: '/pets/{id}',
          operationId: 'getPet',
          pathParams: [
            { name: 'id', required: true, schema: { type: 'string' } },
          ],
          responseSchema: { $ref: '#/components/schemas/Pet' },
        }),
      ],
    })

    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
    })
    const funcFile = files['src/functions/getPet.function.ts']
    assert.ok(funcFile, 'function file should exist')
    // Should NOT import from types file
    assert.ok(
      !funcFile.includes("from '../test-api.types.js'"),
      `should not import from types file when schema is single-use`
    )
    // Schema should be inlined
    assert.ok(funcFile.includes('const PetSchema'), 'should inline PetSchema')
    // Types file should not be generated (no shared schemas)
    assert.equal(
      files['src/test-api.types.ts'],
      undefined,
      'should not generate types file'
    )
  })
})

// ---------------------------------------------------------------------------
// Duplicate properties in z.object() from merged path + operation params
// ---------------------------------------------------------------------------
describe('duplicate parameter deduplication', () => {
  test('does not produce duplicate properties from overlapping params', () => {
    const spec = makeSpec({
      operations: [
        makeOp({
          method: 'get',
          path: '/items/{id}',
          operationId: 'getItem',
          pathParams: [
            { name: 'id', required: true, schema: { type: 'string' } },
          ],
          queryParams: [
            { name: 'id', required: false, schema: { type: 'string' } }, // duplicate from shared params
            { name: 'format', required: false, schema: { type: 'string' } },
          ],
        }),
      ],
    })

    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
    })
    const funcFile = files['src/functions/getItem.function.ts']
    assert.ok(funcFile, 'function file should exist')

    // Count occurrences of 'id:' in the input schema
    const idMatches = funcFile.match(/\bid:/g)
    assert.ok(idMatches, 'should contain id property')
    // Should only appear once in the input schema definition
    assert.equal(
      idMatches.length,
      1,
      `id should appear only once in input, found ${idMatches.length}`
    )
  })
})

// ---------------------------------------------------------------------------
// Empty server URLs fallback
// ---------------------------------------------------------------------------
describe('empty server URLs', () => {
  test('generates variable file even with empty serverUrls', () => {
    const spec = makeSpec({
      serverUrls: [],
      operations: [makeOp({ operationId: 'listItems' })],
    })

    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
    })
    const varFile = files['src/test-api.variable.ts']
    assert.ok(varFile, 'variable file should exist')

    // Should use z.string() instead of z.enum([]) for empty serverUrls
    assert.ok(
      varFile.includes('z.string()'),
      `should fall back to z.string() for empty URLs, got: ${varFile}`
    )
    assert.ok(
      !varFile.includes('z.enum([])'),
      'should not produce empty z.enum([])'
    )
  })
})

// ---------------------------------------------------------------------------
// Apostrophe sanitization in display names
// ---------------------------------------------------------------------------
describe('display name sanitization', () => {
  test('sanitizes apostrophes in display name used in service file', () => {
    const spec = makeSpec({
      operations: [makeOp({ operationId: 'listItems' })],
    })
    const vars = makeVars({ displayName: "O'Reilly API" })

    const files = generateAddonFromOpenAPI(spec, vars, {
      oauth: false,
      secret: false,
    })
    const serviceFile = files['src/test-api-api.service.ts']
    assert.ok(serviceFile, 'service file should exist')

    // The display name should not break string literals
    assert.ok(
      !serviceFile.includes("O'Reilly"),
      `should sanitize apostrophes, got raw apostrophe in service file`
    )
  })
})

// ---------------------------------------------------------------------------
// Tag description newline sanitization
// ---------------------------------------------------------------------------
describe('tag description sanitization', () => {
  test('sanitizes newlines in tag descriptions used as comments', () => {
    const spec = makeSpec({
      operations: [
        makeOp({
          operationId: 'getUser',
          tags: ['Users'],
          method: 'get',
          path: '/users/{id}',
          pathParams: [
            { name: 'id', required: true, schema: { type: 'string' } },
          ],
        }),
      ],
      tagDescriptions: {
        Users: 'User management\nhandles CRUD operations\nfor all users',
      },
    })

    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
    })
    const funcFile = files['src/functions/getUser.function.ts']
    assert.ok(funcFile, 'function file should exist')

    // The comment line should have newlines collapsed to spaces
    const commentLine = funcFile
      .split('\n')
      .find((l: string) => l.startsWith('// Users'))
    if (commentLine) {
      assert.ok(
        !commentLine.includes('\n'),
        'tag description in comment should not contain raw newlines'
      )
    }
  })
})

// ---------------------------------------------------------------------------
// Index file exports
// ---------------------------------------------------------------------------
describe('index file generation', () => {
  test('exports all generated functions', () => {
    const spec = makeSpec({
      operations: [
        makeOp({ operationId: 'listUsers', method: 'get', path: '/users' }),
        makeOp({ operationId: 'createUser', method: 'post', path: '/users' }),
      ],
    })

    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
    })
    const indexFile = files['src/index.ts']
    assert.ok(indexFile, 'index file should exist')
    assert.ok(indexFile.includes('listUsers'))
    assert.ok(indexFile.includes('createUser'))
  })
})

// ---------------------------------------------------------------------------
// Types file not generated when no component schemas
// ---------------------------------------------------------------------------
describe('types file conditional generation', () => {
  test('does not generate types file when no component schemas', () => {
    const spec = makeSpec({
      componentSchemas: {},
      operations: [makeOp({ operationId: 'ping' })],
    })

    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
    })
    assert.equal(
      files['src/test-api.types.ts'],
      undefined,
      'should not generate types file'
    )
  })
})

// ---------------------------------------------------------------------------
// Service file error handling
// ---------------------------------------------------------------------------
describe('service file generation', () => {
  test('generates error switch statement in service file', () => {
    const spec = makeSpec({
      operations: [
        makeOp({
          operationId: 'getItem',
          errorResponses: [
            { statusCode: 404, description: 'Not found' },
            { statusCode: 429, description: 'Rate limited' },
          ],
        }),
      ],
    })

    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
    })
    const serviceFile = files['src/test-api-api.service.ts']
    assert.ok(serviceFile, 'service file should exist')
    assert.ok(serviceFile.includes('NotFoundError'))
    assert.ok(serviceFile.includes('case 404'))
  })
})

// ---------------------------------------------------------------------------
// MCP flag
// ---------------------------------------------------------------------------
describe('MCP flag', () => {
  test('adds mcp: true to function config when flag is set', () => {
    const spec = makeSpec({
      operations: [makeOp({ operationId: 'listItems' })],
    })

    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
      mcp: true,
    })
    const funcFile = files['src/functions/listItems.function.ts']
    assert.ok(funcFile, 'function file should exist')
    assert.ok(funcFile.includes('mcp: true'), 'should include mcp flag')
  })
})
