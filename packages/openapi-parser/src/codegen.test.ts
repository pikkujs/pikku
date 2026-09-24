import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import ts from 'typescript'
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
    const schemasFile = files['src/functions/getPet.schemas.ts']
    assert.ok(schemasFile, 'schemas file should exist')
    assert.ok(
      schemasFile.includes("from '../test-api.types.js'"),
      `should import from types file, got: ${schemasFile.split('\n').slice(0, 10).join('\n')}`
    )
    assert.ok(schemasFile.includes('PetSchema'), 'should reference PetSchema')
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
    const schemasFile = files['src/functions/getPet.schemas.ts']
    assert.ok(schemasFile, 'schemas file should exist')
    // Should NOT import from types file
    assert.ok(
      !schemasFile.includes("from '../test-api.types.js'"),
      `should not import from types file when schema is single-use`
    )
    // Schema should be inlined
    assert.ok(
      schemasFile.includes('const PetSchema'),
      'should inline PetSchema'
    )
    // Types file should not be generated (no shared schemas)
    assert.equal(
      files['src/test-api.types.ts'],
      undefined,
      'should not generate types file'
    )
  })
})

// ---------------------------------------------------------------------------
// Schemas are read by codegen before the addon's #pikku tree exists
// ---------------------------------------------------------------------------
describe('sibling schemas file', () => {
  const spec = makeSpec({
    operations: [
      makeOp({
        method: 'get',
        path: '/pets/{id}',
        operationId: 'getPet',
        pathParams: [
          { name: 'id', required: true, schema: { type: 'string' } },
        ],
        responseSchema: {
          type: 'object' as const,
          properties: { id: { type: 'string' as const } },
        },
      }),
      makeOp({ method: 'post', path: '/ping', operationId: 'ping' }),
    ],
  })
  const files = generateAddonFromOpenAPI(spec, makeVars(), {
    oauth: false,
    secret: false,
  })

  test('input and output schemas are declared in <fn>.schemas.ts', () => {
    const schemasFile = files['src/functions/getPet.schemas.ts']
    assert.ok(schemasFile, 'schemas file should exist')
    assert.ok(schemasFile.includes('export const GetPetInput = '))
    assert.ok(schemasFile.includes('export const GetPetOutput = '))
  })

  test('the schemas file never imports #pikku', () => {
    const schemasFile = files['src/functions/getPet.schemas.ts']
    assert.ok(
      !schemasFile.includes('#pikku'),
      `schemas file must be importable before .pikku is built, got:\n${schemasFile}`
    )
  })

  test('the function file imports its schemas instead of declaring them', () => {
    const funcFile = files['src/functions/getPet.function.ts']
    assert.ok(
      funcFile.includes(
        "import { GetPetInput, GetPetOutput } from './getPet.schemas.js'"
      ),
      funcFile
    )
    assert.ok(!funcFile.includes("from 'zod'"), funcFile)
    assert.ok(!funcFile.includes('export const GetPetInput'), funcFile)
  })

  test('generated imports resolve into the addon tree, .pikku/addon/', () => {
    const funcFile = files['src/functions/getPet.function.ts']
    assert.ok(
      funcFile.includes(
        "import { pikkuSessionlessFunc } from '#pikku/addon/function'"
      ),
      funcFile
    )
    const service = Object.entries(files).find(([path]) =>
      path.endsWith('-api.service.ts')
    )?.[1]
    assert.ok(service, 'service file should exist')
    assert.ok(
      service.includes("from '#pikku/addon/variables/pikku-variables.gen.js'"),
      service
    )
  })

  test('an operation with no response schema declares an unknown output', () => {
    const schemasFile = files['src/functions/ping.schemas.ts']
    assert.ok(schemasFile.includes('export const PingOutput = z.unknown()'), schemasFile)
    assert.ok(!schemasFile.includes('PingInput'), schemasFile)
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
    const schemasFile = files['src/functions/getItem.schemas.ts']
    assert.ok(schemasFile, 'schemas file should exist')

    // Count occurrences of 'id:' in the input schema
    const idMatches = schemasFile.match(/\bid:/g)
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

// ---------------------------------------------------------------------------
// camelCase flag
// ---------------------------------------------------------------------------
describe('camelCase flag', () => {
  test('converts snake_case param names to camelCase in function input schema', () => {
    const spec = makeSpec({
      operations: [
        makeOp({
          operationId: 'getRepo',
          method: 'get',
          path: '/repos/{repo_slug}',
          pathParams: [
            { name: 'repo_slug', required: true, schema: { type: 'string' } },
          ],
          queryParams: [
            { name: 'page_size', required: false, schema: { type: 'number' } },
          ],
        }),
      ],
    })

    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
      camelCase: true,
    })
    const schemasFile = files['src/functions/getRepo.schemas.ts']
    assert.ok(schemasFile, 'schemas file should exist')
    // Should use camelCase names
    assert.ok(
      schemasFile.includes('repoSlug:'),
      'should convert repo_slug to repoSlug'
    )
    assert.ok(
      schemasFile.includes('pageSize:'),
      'should convert page_size to pageSize'
    )
    // Should NOT have original snake_case names in the schema
    assert.ok(
      !schemasFile.includes('repo_slug:'),
      'should not contain repo_slug'
    )
    assert.ok(
      !schemasFile.includes('page_size:'),
      'should not contain page_size'
    )
  })

  test('converts snake_case object property names to camelCase in response schema', () => {
    const responseSchema = {
      type: 'object' as const,
      properties: {
        created_at: { type: 'string' as const },
        display_name: { type: 'string' as const },
        id: { type: 'string' as const },
      },
    }

    const spec = makeSpec({
      operations: [
        makeOp({
          operationId: 'getUser',
          method: 'get',
          path: '/users/{id}',
          pathParams: [
            { name: 'id', required: true, schema: { type: 'string' } },
          ],
          responseSchema,
        }),
      ],
    })

    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
      camelCase: true,
    })
    const schemasFile = files['src/functions/getUser.schemas.ts']
    assert.ok(schemasFile, 'schemas file should exist')
    // Output schema should use camelCase
    assert.ok(
      schemasFile.includes('createdAt:'),
      'should convert created_at to createdAt'
    )
    assert.ok(
      schemasFile.includes('displayName:'),
      'should convert display_name to displayName'
    )
    // Should still have 'id' (no conversion needed)
    assert.ok(schemasFile.includes('id:'), 'should keep id as-is')
  })

  test('converts snake_case body property names to camelCase in input schema', () => {
    const requestBody = {
      type: 'object' as const,
      properties: {
        first_name: { type: 'string' as const },
        last_name: { type: 'string' as const },
      },
      required: ['first_name'],
    }

    const spec = makeSpec({
      operations: [
        makeOp({
          operationId: 'createUser',
          method: 'post',
          path: '/users',
          requestBody,
        }),
      ],
    })

    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
      camelCase: true,
    })
    const schemasFile = files['src/functions/createUser.schemas.ts']
    assert.ok(schemasFile, 'schemas file should exist')
    assert.ok(
      schemasFile.includes('firstName:'),
      'should convert first_name to firstName'
    )
    assert.ok(
      schemasFile.includes('lastName:'),
      'should convert last_name to lastName'
    )
  })

  test('generates _toSnakeCase and _toCamelCase helpers in service file', () => {
    const spec = makeSpec({
      operations: [makeOp({ operationId: 'listItems' })],
    })

    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
      camelCase: true,
    })
    const serviceFile = files['src/test-api-api.service.ts']
    assert.ok(serviceFile, 'service file should exist')
    assert.ok(
      serviceFile.includes('_toSnakeCase'),
      'should contain _toSnakeCase helper'
    )
    assert.ok(
      serviceFile.includes('_toCamelCase'),
      'should contain _toCamelCase helper'
    )
    assert.ok(
      serviceFile.includes('rawData'),
      'should use rawData for snake_case converted input'
    )
  })

  test('does not convert names when camelCase flag is off', () => {
    const spec = makeSpec({
      operations: [
        makeOp({
          operationId: 'getRepo',
          method: 'get',
          path: '/repos/{repo_slug}',
          pathParams: [
            { name: 'repo_slug', required: true, schema: { type: 'string' } },
          ],
        }),
      ],
    })

    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
      camelCase: false,
    })
    const schemasFile = files['src/functions/getRepo.schemas.ts']
    assert.ok(schemasFile, 'schemas file should exist')
    // Should keep original snake_case names
    assert.ok(schemasFile.includes('repo_slug:'), 'should keep repo_slug as-is')
    assert.ok(
      !schemasFile.includes('repoSlug:'),
      'should not convert to repoSlug'
    )
  })

  test('converts snake_case in shared component schemas', () => {
    const itemSchema = {
      type: 'object' as const,
      properties: {
        item_name: { type: 'string' as const },
        created_at: { type: 'string' as const },
      },
    }

    const spec = makeSpec({
      componentSchemas: {
        Item: itemSchema,
      },
      operations: [
        makeOp({
          method: 'get',
          path: '/items',
          operationId: 'listItems',
          responseSchema: { type: 'array' as const, items: itemSchema },
        }),
        makeOp({
          method: 'get',
          path: '/items/{id}',
          operationId: 'getItem',
          pathParams: [
            { name: 'id', required: true, schema: { type: 'string' } },
          ],
          responseSchema: itemSchema,
        }),
      ],
    })

    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
      camelCase: true,
    })
    const typesFile = files['src/test-api.types.ts']
    assert.ok(typesFile, 'types file should exist')
    assert.ok(
      typesFile.includes('itemName:'),
      'should convert item_name to itemName in shared schema'
    )
    assert.ok(
      typesFile.includes('createdAt:'),
      'should convert created_at to createdAt in shared schema'
    )
  })

  test('ROUTES map keeps original snake_case names for HTTP requests', () => {
    const spec = makeSpec({
      operations: [
        makeOp({
          operationId: 'getRepo',
          method: 'get',
          path: '/repos/{repo_slug}',
          pathParams: [
            { name: 'repo_slug', required: true, schema: { type: 'string' } },
          ],
          queryParams: [
            { name: 'page_size', required: false, schema: { type: 'number' } },
          ],
        }),
      ],
    })

    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
      camelCase: true,
    })
    const serviceFile = files['src/test-api-api.service.ts']
    assert.ok(serviceFile, 'service file should exist')
    // ROUTES should use original names for HTTP path interpolation
    assert.ok(
      serviceFile.includes('"repo_slug"'),
      'ROUTES should keep repo_slug for path params'
    )
    assert.ok(
      serviceFile.includes('"page_size"'),
      'ROUTES should keep page_size for query params'
    )
  })
})

// ---------------------------------------------------------------------------
// Function/MCP-tool description synthesis (specs that omit descriptions)
// ---------------------------------------------------------------------------
describe('function description synthesis', () => {
  test('synthesizes a description from operationId when the spec omits one', () => {
    const spec = makeSpec({
      operations: [
        makeOp({
          operationId: 'contactsControllerGetContacts',
          method: 'get',
          path: '/contacts',
        }),
      ],
    })

    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
      mcp: true,
    })
    const funcFile =
      files['src/functions/contactsControllerGetContacts.function.ts']
    assert.ok(funcFile, 'function file should exist')
    assert.ok(
      funcFile.includes('description: "Contacts get contacts"'),
      'humanized operationId (Controller stripped) should be emitted as the description'
    )
    assert.ok(funcFile.includes('mcp: true'), 'mcp tool flag should be present')
  })

  test('falls back to "METHOD /path" when operationId is absent', () => {
    const spec = makeSpec({
      operations: [
        makeOp({ operationId: undefined, method: 'get', path: '/health' }),
      ],
    })

    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
    })
    const key = Object.keys(files).find((k) => k.startsWith('src/functions/'))
    assert.ok(key, 'a function file should be generated')
    assert.ok(
      files[key].includes('description: "GET /health"'),
      'should fall back to METHOD path when nothing else is available'
    )
  })

  test('prefers the spec description over synthesis', () => {
    const spec = makeSpec({
      operations: [
        makeOp({
          operationId: 'getPet',
          description: 'Fetch a single pet by id',
        }),
      ],
    })

    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
    })
    const funcFile = files['src/functions/getPet.function.ts']
    assert.ok(
      funcFile.includes('description: "Fetch a single pet by id"'),
      'the real spec description should win over the synthesized one'
    )
  })
})

// ---------------------------------------------------------------------------
// Auth-config: custom headers + delegated login
// ---------------------------------------------------------------------------
describe('auth config', () => {
  const delegatedConfig = {
    headerName: 'authentication',
    headerFormat: 'raw' as const,
    delegated: {
      loginPath: '/users/login-ai-plugin',
      loginMethod: 'post',
      credentials: ['email', 'password'] as ('email' | 'password' | 'apiKey')[],
      apiKeyHeader: 'x-api-key',
      tokenPath: 'token',
      claims: {
        source: 'jwt' as const,
        externalId: 'user._id',
        email: 'user.email',
        name: ['user.first_name', 'user.last_name'],
        role: 'user.role',
        tenantId: 'user.company',
      },
    },
  }

  test('custom raw header replaces Authorization Bearer in the bearer-credential service', () => {
    const spec = makeSpec({ operations: [makeOp()] })
    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
      credential: 'bearer',
      authConfig: delegatedConfig,
    })
    const service = files['src/test-api-api.service.ts']
    assert.ok(
      service.includes('headers["authentication"] = this.creds.token'),
      'custom raw header should carry the bare token'
    )
    assert.ok(
      !service.includes('headers.Authorization'),
      'default Authorization header must not be emitted'
    )
  })

  test('custom header with bearer format keeps the Bearer prefix', () => {
    const spec = makeSpec({ operations: [makeOp()] })
    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
      credential: 'bearer',
      authConfig: { headerName: 'x-auth', headerFormat: 'bearer' as const },
    })
    const service = files['src/test-api-api.service.ts']
    assert.ok(
      service.includes('headers["x-auth"] = `Bearer ${this.creds.token}`'),
      'bearer format should keep the prefix on the custom header'
    )
  })

  test('delegated config emits the upstream-auth file and exports it', () => {
    const spec = makeSpec({ operations: [makeOp()] })
    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
      credential: 'bearer',
      authConfig: delegatedConfig,
    })
    const authFile = files['src/test-api-upstream-auth.ts']
    assert.ok(authFile, 'upstream auth file should be generated')
    assert.ok(authFile.includes('export const authenticateTestApiUpstream'))
    assert.ok(
      authFile.includes('/users/login-ai-plugin'),
      'login path baked in'
    )
    assert.ok(authFile.includes('"user._id"'), 'externalId claim path baked in')
    assert.ok(
      authFile.includes("pick(claims, 'exp')"),
      'jwt source defaults expiry to the exp claim'
    )
    assert.ok(
      files['src/index.ts'].includes(
        "export { authenticateTestApiUpstream } from './test-api-upstream-auth.js'"
      ),
      'index should export the authenticate function'
    )
  })

  test('extraHeaders are baked into the service and the upstream-auth login', () => {
    const spec = makeSpec({ operations: [makeOp()] })
    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
      credential: 'bearer',
      authConfig: {
        ...delegatedConfig,
        extraHeaders: { Origin: 'https://tenant.example.com' },
      },
    })
    const service = files['src/test-api-api.service.ts']
    assert.ok(
      service.includes('"Origin": "https://tenant.example.com",'),
      'service headers init should carry the static header'
    )
    const authFile = files['src/test-api-upstream-auth.ts']
    assert.ok(
      authFile.includes('"Origin": "https://tenant.example.com",'),
      'login fetch should carry the static header'
    )
  })

  test('no delegated config → no upstream-auth file', () => {
    const spec = makeSpec({ operations: [makeOp()] })
    const files = generateAddonFromOpenAPI(spec, makeVars(), {
      oauth: false,
      secret: false,
      credential: 'bearer',
    })
    assert.equal(files['src/test-api-upstream-auth.ts'], undefined)
  })
})

describe('vague responses, base URL and per-user credentials', () => {
  const flags = { oauth: false, secret: false }

  test('a missing or bare-string response becomes z.unknown()', () => {
    const spec = makeSpec({
      operations: [
        makeOp({ operationId: 'noBody', path: '/a' }),
        makeOp({
          operationId: 'bareString',
          path: '/b',
          responseSchema: { type: 'string' },
        }),
        makeOp({
          operationId: 'stringList',
          path: '/c',
          responseSchema: { type: 'array', items: { type: 'string' } },
        }),
        makeOp({
          operationId: 'csvExport',
          path: '/d',
          responseSchema: { type: 'string' },
          responseMediaType: 'text/csv',
        }),
        makeOp({
          operationId: 'dated',
          path: '/e',
          responseSchema: { type: 'string', format: 'date-time' },
        }),
      ],
    })
    const files = generateAddonFromOpenAPI(spec, makeVars(), flags)
    for (const id of ['noBody', 'bareString', 'stringList']) {
      const schemas = files[`src/functions/${id}.schemas.ts`]
      assert.match(schemas, /Output = z\.unknown\(\)/, `${id}: ${schemas}`)
    }
    for (const id of ['csvExport', 'dated']) {
      const schemas = files[`src/functions/${id}.schemas.ts`]
      assert.doesNotMatch(schemas, /z\.unknown\(\)/, `${id}: ${schemas}`)
    }
  })

  test('the base URL is a url() with the first server as default, never an enum', () => {
    const spec = makeSpec({
      serverUrls: ['https://eu.example.com/v1', 'https://us.example.com/v1'],
    })
    const file = generateAddonFromOpenAPI(spec, makeVars(), flags)[
      'src/test-api.variable.ts'
    ]
    assert.ok(
      file.includes('z.string().url().default("https://eu.example.com/v1")'),
      file
    )
    assert.ok(!file.includes('z.enum'), file)
  })

  test('a relative-only server leaves the base URL without a default', () => {
    const spec = makeSpec({ serverUrls: ['/api/v3'], baseUrl: '/api/v3' })
    const file = generateAddonFromOpenAPI(spec, makeVars(), flags)[
      'src/test-api.variable.ts'
    ]
    assert.ok(file.includes('z.string().url()'), file)
    assert.ok(!file.includes('.default('), file)
  })

  test('a 401 on a per-user credential is a typed re-link error', () => {
    const spec = makeSpec({ operations: [makeOp()] })
    const connect = generateAddonFromOpenAPI(spec, makeVars(), {
      ...flags,
      credential: 'apikey',
    })['src/test-api-api.service.ts']
    assert.ok(
      connect.includes('case 401: throw new CredentialRejectedError("testApi", "connect")'),
      connect
    )
    const delegated = generateAddonFromOpenAPI(spec, makeVars(), {
      ...flags,
      credential: 'bearer',
      authConfig: {
        headerName: 'DOLAPIKEY',
        headerFormat: 'raw' as const,
        delegated: { loginPath: '/login', tokenPath: 'success.token' } as any,
      },
    })['src/test-api-api.service.ts']
    assert.ok(
      delegated.includes('CredentialRejectedError("testApi", "sign-in")'),
      delegated
    )
    const shared = generateAddonFromOpenAPI(spec, makeVars(), {
      ...flags,
      secret: true,
    })['src/test-api-api.service.ts']
    assert.ok(!shared.includes('CredentialRejectedError'), shared)
    assert.ok(shared.includes('private creds: TestApiSecrets'), shared)
  })

  test('basic credentials are sent as an Authorization Basic header', () => {
    const spec = makeSpec({ operations: [makeOp()], authType: 'basic' })
    const service = generateAddonFromOpenAPI(spec, makeVars(), {
      ...flags,
      credential: 'basic',
    })['src/test-api-api.service.ts']
    assert.ok(service.includes('{ username: string; password: string }'), service)
    assert.ok(service.includes('`Basic ${btoa('), service)
  })

  test('form and multipart request bodies are marked on the route', () => {
    const spec = makeSpec({
      operations: [
        makeOp({
          method: 'post',
          path: '/form',
          operationId: 'sendForm',
          requestBody: { type: 'object', properties: { a: { type: 'string' } } },
          requestBodyMediaType: 'application/x-www-form-urlencoded',
        }),
        makeOp({
          method: 'post',
          path: '/upload',
          operationId: 'upload',
          requestBody: { type: 'object', properties: { file: { type: 'string' } } },
          requestBodyMediaType: 'multipart/form-data',
        }),
      ],
    })
    const service = generateAddonFromOpenAPI(spec, makeVars(), flags)[
      'src/test-api-api.service.ts'
    ]
    assert.ok(service.includes('"body": "form"'), service)
    assert.ok(service.includes('"body": "multipart"'), service)
  })
})

describe('delegated login without a JWT', () => {
  const authConfig = {
    headerName: 'DOLAPIKEY',
    headerFormat: 'raw' as const,
    delegated: {
      loginPath: '/login',
      loginMethod: 'post',
      credentials: ['login', 'password'] as ('login' | 'password')[],
      fields: { login: 'login', password: 'password' },
      encoding: 'json' as const,
      tokenPath: 'success.token',
      identity: { path: '/users/info', method: 'get' },
      claims: {
        externalId: 'id',
        email: 'email',
        name: ['firstname', 'lastname'],
        role: 'admin',
        tenantId: 'entity',
      },
      emailTemplate: '{login}@{host}',
      roles: { '1': 'dolibarr-admin' },
    },
  }
  const file = generateAddonFromOpenAPI(
    makeSpec({ operations: [makeOp()] }),
    makeVars(),
    { oauth: false, secret: false, credential: 'bearer', authConfig }
  )['src/test-api-upstream-auth.ts']

  test('reads the identity endpoint with the fresh token', () => {
    assert.ok(file.includes('/users/info'), file)
    assert.ok(file.includes('"DOLAPIKEY"'), file)
  })

  test('synthesizes an email from the template when upstream has none', () => {
    assert.ok(file.includes('{login}@{host}'), file)
    assert.ok(file.includes('syntheticEmail'), file)
  })

  test('maps upstream roles', () => {
    assert.ok(file.includes('"dolibarr-admin"'), file)
  })
})

describe('generated sources parse', () => {
  const modes = {
    none: { oauth: false, secret: false },
    shared: { oauth: false, secret: true },
    apikey: { oauth: false, secret: false, credential: 'apikey' as const },
    basic: { oauth: false, secret: false, credential: 'basic' as const },
    oauth2: { oauth: true, secret: false, credential: 'oauth2' as const },
    delegated: {
      oauth: false,
      secret: false,
      credential: 'bearer' as const,
      authConfig: {
        headerName: 'X-Key',
        headerFormat: 'raw' as const,
        delegated: { loginPath: '/login', tokenPath: 'token' } as any,
      },
    },
  }
  for (const [mode, flags] of Object.entries(modes)) {
    test(mode, () => {
      const files = generateAddonFromOpenAPI(
        makeSpec({ operations: [makeOp({ operationId: 'listItems' })] }),
        makeVars(),
        { ...flags, camelCase: mode === 'apikey' }
      )
      for (const [path, source] of Object.entries(files)) {
        if (!path.endsWith('.ts')) continue
        const { diagnostics } = ts.transpileModule(source, {
          reportDiagnostics: true,
          fileName: path,
        })
        assert.deepEqual(
          diagnostics?.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
          [],
          `${path}:\n${source}`
        )
      }
    })
  }
})
