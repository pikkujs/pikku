import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import {
  sanitizeIdentifier,
  singularize,
  toCamelCase,
  toPascalCase,
  detectCommonPrefix,
  generateOperationNames,
} from './naming.js'

// ---------------------------------------------------------------------------
// sanitizeIdentifier
// ---------------------------------------------------------------------------
describe('sanitizeIdentifier', () => {
  test('prefixes reserved words with underscore', () => {
    assert.equal(sanitizeIdentifier('delete'), '_delete')
    assert.equal(sanitizeIdentifier('package'), '_package')
    assert.equal(sanitizeIdentifier('class'), '_class')
    assert.equal(sanitizeIdentifier('import'), '_import')
    assert.equal(sanitizeIdentifier('export'), '_export')
    assert.equal(sanitizeIdentifier('return'), '_return')
    assert.equal(sanitizeIdentifier('function'), '_function')
    assert.equal(sanitizeIdentifier('yield'), '_yield')
  })

  test('prefixes names starting with digits with "n"', () => {
    assert.equal(
      sanitizeIdentifier('4oDBrowseByDateFeed'),
      'n4oDBrowseByDateFeed'
    )
    assert.equal(sanitizeIdentifier('123abc'), 'n123abc')
    assert.equal(sanitizeIdentifier('0'), 'n0')
  })

  test('strips numeric separators (1_000 → 1000)', () => {
    assert.equal(sanitizeIdentifier('limit1_000'), 'limit1000')
    assert.equal(sanitizeIdentifier('max1_000_000'), 'max1000000')
  })

  test('strips curly braces from operationId-like names', () => {
    // sanitizeIdentifier strips all non-alphanumeric/underscore/$
    assert.equal(
      sanitizeIdentifier('createProfiles{extension}'),
      'createProfilesextension'
    )
  })

  test('strips dashes and special characters', () => {
    assert.equal(sanitizeIdentifier('foo-bar'), 'foobar')
    assert.equal(sanitizeIdentifier('hello.world'), 'helloworld')
  })

  test('returns "unnamed" for empty string after sanitization', () => {
    assert.equal(sanitizeIdentifier('---'), 'unnamed')
    assert.equal(sanitizeIdentifier(''), 'unnamed')
  })

  test('does not prefix underscore-only names as digit-leading', () => {
    assert.equal(sanitizeIdentifier('_foo'), '_foo')
  })
})

// ---------------------------------------------------------------------------
// singularize
// ---------------------------------------------------------------------------
describe('singularize', () => {
  test('regular plurals', () => {
    assert.equal(singularize('users'), 'user')
    assert.equal(singularize('products'), 'product')
  })

  test('ies → y', () => {
    assert.equal(singularize('categories'), 'category')
    assert.equal(singularize('entries'), 'entry')
  })

  test('irregular plurals', () => {
    assert.equal(singularize('addresses'), 'address')
    assert.equal(singularize('statuses'), 'status')
    assert.equal(singularize('indices'), 'index')
    assert.equal(singularize('aliases'), 'alias')
  })

  test('shes/ches/xes/zes/sses → drop "es"', () => {
    assert.equal(singularize('bushes'), 'bush')
    assert.equal(singularize('churches'), 'church')
    assert.equal(singularize('boxes'), 'box')
  })

  test('preserves words ending in ss or us', () => {
    assert.equal(singularize('class'), 'class')
    assert.equal(singularize('campus'), 'campus')
  })

  test('does not singularize short words', () => {
    assert.equal(singularize('as'), 'as')
  })
})

// ---------------------------------------------------------------------------
// toCamelCase / toPascalCase
// ---------------------------------------------------------------------------
describe('toCamelCase', () => {
  test('converts kebab-case', () => {
    assert.equal(toCamelCase('foo-bar'), 'fooBar')
  })

  test('converts snake_case', () => {
    assert.equal(toCamelCase('foo_bar'), 'fooBar')
  })

  test('lowers leading capital', () => {
    assert.equal(toCamelCase('FooBar'), 'fooBar')
  })

  test('strips trailing non-alphanumeric', () => {
    assert.equal(toCamelCase('foo-bar-'), 'fooBar')
  })
})

describe('toPascalCase', () => {
  test('uppercases first letter', () => {
    assert.equal(toPascalCase('foo-bar'), 'FooBar')
  })
})

// ---------------------------------------------------------------------------
// detectCommonPrefix
// ---------------------------------------------------------------------------
describe('detectCommonPrefix', () => {
  test('detects /api/v1/ prefix shared by majority', () => {
    const paths = [
      '/api/v1/users',
      '/api/v1/users/{id}',
      '/api/v1/products',
      '/api/v1/orders',
    ]
    assert.equal(detectCommonPrefix(paths), '/api/v1/')
  })

  test('detects prefix even with outliers below 25%', () => {
    const paths = [
      '/api/v2/users',
      '/api/v2/products',
      '/api/v2/orders',
      '/api/v2/settings',
      '/oauth/authorize', // outlier
    ]
    // 4 out of 5 share /api/v2/ → 80% > 75% threshold
    assert.equal(detectCommonPrefix(paths), '/api/v2/')
  })

  test('returns empty when no common prefix', () => {
    const paths = ['/users', '/products', '/orders']
    assert.equal(detectCommonPrefix(paths), '')
  })

  test('returns empty for empty array', () => {
    assert.equal(detectCommonPrefix([]), '')
  })

  test('skips path-parameter segments as prefix candidates', () => {
    const paths = ['/{version}/users', '/{version}/products']
    // {version} starts with {, so it should not be considered a prefix
    assert.equal(detectCommonPrefix(paths), '')
  })
})

// ---------------------------------------------------------------------------
// generateOperationNames
// ---------------------------------------------------------------------------
describe('generateOperationNames', () => {
  test('uses operationId when available', () => {
    const ops = [{ method: 'get', path: '/users', operationId: 'listUsers' }]
    const result = generateOperationNames(ops, '')
    assert.equal(result[0].functionName, 'listUsers')
  })

  test('strips curly braces from operationId', () => {
    const ops = [
      {
        method: 'post',
        path: '/profiles',
        operationId: 'createProfiles{extension}',
      },
    ]
    const result = generateOperationNames(ops, '')
    // {} are stripped, then toCamelCase runs — no separator between "Profiles" and "extension"
    // so the result is "createProfilesextension"
    assert.equal(result[0].functionName, 'createProfilesextension')
  })

  test('strips curly braces with separators from operationId', () => {
    const ops = [
      {
        method: 'post',
        path: '/profiles',
        operationId: 'create-profiles-{extension}',
      },
    ]
    const result = generateOperationNames(ops, '')
    // With dashes as separators, toCamelCase capitalizes after each separator
    assert.equal(result[0].functionName, 'createProfilesExtension')
  })

  test('derives name from path when no operationId', () => {
    const ops = [{ method: 'get', path: '/users/{id}' }]
    const result = generateOperationNames(ops, '')
    assert.equal(result[0].functionName, 'getUser')
  })

  test('uses "list" prefix for GET on collection', () => {
    const ops = [{ method: 'get', path: '/users' }]
    const result = generateOperationNames(ops, '')
    assert.equal(result[0].functionName, 'listUsers')
  })

  test('handles collision by appending counter', () => {
    const ops = [
      { method: 'get', path: '/users', operationId: 'listUsers' },
      { method: 'get', path: '/v2/users', operationId: 'listUsers' },
    ]
    const result = generateOperationNames(ops, '')
    assert.equal(result[0].functionName, 'listUsers')
    assert.equal(result[1].functionName, 'listUsers2')
  })

  test('sanitizes reserved word operationIds', () => {
    const ops = [
      { method: 'delete', path: '/items/{id}', operationId: 'delete' },
    ]
    const result = generateOperationNames(ops, '')
    assert.equal(result[0].functionName, '_delete')
  })

  test('sanitizes digit-leading operationIds', () => {
    const ops = [
      { method: 'get', path: '/feeds', operationId: '4oDBrowseByDateFeed' },
    ]
    const result = generateOperationNames(ops, '')
    assert.equal(result[0].functionName, 'n4oDBrowseByDateFeed')
  })

  test('strips common prefix from path-derived names', () => {
    const ops = [
      { method: 'get', path: '/api/v1/users' },
      { method: 'get', path: '/api/v1/products' },
    ]
    const result = generateOperationNames(ops, '/api/v1/')
    assert.equal(result[0].functionName, 'listUsers')
    assert.equal(result[1].functionName, 'listProducts')
  })

  test('handles dashes and underscores in operationIds', () => {
    const ops = [{ method: 'get', path: '/x', operationId: 'get-all_items' }]
    const result = generateOperationNames(ops, '')
    assert.equal(result[0].functionName, 'getAllItems')
  })
})
