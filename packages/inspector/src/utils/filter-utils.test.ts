import { test, describe } from 'node:test'
import { strict as assert } from 'node:assert'
import type { InspectorFilters } from '../types'
import { matchesFilters, matchesWildcard } from './filter-utils'

describe('matchesFilters', () => {
  // Mock logger for testing
  const mockLogger = {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
    critical: () => {},
    hasCriticalErrors: () => false,
  }

  describe('Empty filters', () => {
    test('should return true when no filters are provided', () => {
      const filters: InspectorFilters = {}

      const result = matchesFilters(
        filters,
        { tags: ['test'] },
        { type: 'http', name: 'test-route' },
        mockLogger
      )

      assert.equal(result, true)
    })

    test('should return true when all filter arrays are empty', () => {
      const filters: InspectorFilters = {
        tags: [],
        types: [],
        directories: [],
      }

      const result = matchesFilters(
        filters,
        { tags: ['test'] },
        { type: 'http', name: 'test-route' },
        mockLogger
      )

      assert.equal(result, true)
    })
  })

  describe('Tag filtering', () => {
    test('should return true when tags match', () => {
      const filters: InspectorFilters = {
        tags: ['api', 'public'],
      }

      const result = matchesFilters(
        filters,
        { tags: ['api', 'internal'] },
        { type: 'http', name: 'test-route' },
        mockLogger
      )

      assert.equal(result, true)
    })

    test('should return false when tags do not match', () => {
      const filters: InspectorFilters = {
        tags: ['api', 'public'],
      }

      const result = matchesFilters(
        filters,
        { tags: ['internal', 'private'] },
        { type: 'http', name: 'test-route' },
        mockLogger
      )

      assert.equal(result, false)
    })

    test('should return false when function has no tags but filter requires tags', () => {
      const filters: InspectorFilters = {
        tags: ['api'],
      }

      const result = matchesFilters(
        filters,
        { tags: undefined },
        { type: 'http', name: 'test-route' },
        mockLogger
      )

      assert.equal(result, false)
    })

    test('should return false when function has empty tags but filter requires tags', () => {
      const filters: InspectorFilters = {
        tags: ['api'],
      }

      const result = matchesFilters(
        filters,
        { tags: [] },
        { type: 'http', name: 'test-route' },
        mockLogger
      )

      assert.equal(result, false)
    })
  })

  describe('Type filtering', () => {
    test('should return true when type matches', () => {
      const filters: InspectorFilters = {
        types: ['http', 'channel'],
      }

      const result = matchesFilters(
        filters,
        { tags: ['test'] },
        { type: 'http', name: 'test-route' },
        mockLogger
      )

      assert.equal(result, true)
    })

    test('should return false when type does not match', () => {
      const filters: InspectorFilters = {
        types: ['channel', 'queue'],
      }

      const result = matchesFilters(
        filters,
        { tags: ['test'] },
        { type: 'http', name: 'test-route' },
        mockLogger
      )

      assert.equal(result, false)
    })

    test('should handle all PikkuWiringTypes correctly', () => {
      const eventTypes = ['http', 'channel', 'queue', 'scheduler', 'rpc', 'mcp']

      eventTypes.forEach((eventType) => {
        const filters: InspectorFilters = {
          types: [eventType],
        }

        const result = matchesFilters(
          filters,
          { tags: ['test'] },
          { type: eventType, name: 'test-route' },
          mockLogger
        )

        assert.equal(result, true, `Should match for type: ${eventType}`)
      })
    })
  })

  describe('Directory filtering', () => {
    test('should return true when directory matches', () => {
      const filters: InspectorFilters = {
        directories: ['src/api', 'src/internal'],
      }

      const result = matchesFilters(
        filters,
        { tags: ['test'] },
        {
          type: 'http',
          name: 'test-route',
          filePath: '/project/src/api/routes.ts',
        },
        mockLogger
      )

      assert.equal(result, true)
    })

    test('should return false when directory does not match', () => {
      const filters: InspectorFilters = {
        directories: ['src/api', 'src/internal'],
      }

      const result = matchesFilters(
        filters,
        { tags: ['test'] },
        {
          type: 'http',
          name: 'test-route',
          filePath: '/project/src/public/routes.ts',
        },
        mockLogger
      )

      assert.equal(result, false)
    })

    test('should handle Windows paths correctly', () => {
      const filters: InspectorFilters = {
        directories: ['src\\api'],
      }

      const result = matchesFilters(
        filters,
        { tags: ['test'] },
        {
          type: 'http',
          name: 'test-route',
          filePath: 'C:\\project\\src\\api\\routes.ts',
        },
        mockLogger
      )

      assert.equal(result, true)
    })

    test('should handle mixed path separators', () => {
      const filters: InspectorFilters = {
        directories: ['src/api'],
      }

      const result = matchesFilters(
        filters,
        { tags: ['test'] },
        {
          type: 'http',
          name: 'test-route',
          filePath: 'C:\\project\\src\\api\\routes.ts',
        },
        mockLogger
      )

      assert.equal(result, true)
    })

    test('should return false when filePath is not provided but directory filter exists', () => {
      const filters: InspectorFilters = {
        directories: ['src/api'],
      }

      const result = matchesFilters(
        filters,
        { tags: ['test'] },
        { type: 'http', name: 'test-route' }, // no filePath
        mockLogger
      )

      assert.equal(result, false)
    })

    test('should handle partial path matches', () => {
      const filters: InspectorFilters = {
        directories: ['api'],
      }

      const result = matchesFilters(
        filters,
        { tags: ['test'] },
        {
          type: 'http',
          name: 'test-route',
          filePath: '/project/src/api/v1/routes.ts',
        },
        mockLogger
      )

      assert.equal(result, true)
    })
  })

  describe('Combined filtering', () => {
    test('should return true when all filters pass', () => {
      const filters: InspectorFilters = {
        tags: ['api'],
        types: ['http'],
        directories: ['src/api'],
      }

      const result = matchesFilters(
        filters,
        { tags: ['api', 'public'] },
        {
          type: 'http',
          name: 'test-route',
          filePath: '/project/src/api/routes.ts',
        },
        mockLogger
      )

      assert.equal(result, true)
    })

    test('should return false when type filter fails (even if others pass)', () => {
      const filters: InspectorFilters = {
        tags: ['api'],
        types: ['channel'],
        directories: ['src/api'],
      }

      const result = matchesFilters(
        filters,
        { tags: ['api', 'public'] },
        {
          type: 'http',
          name: 'test-route',
          filePath: '/project/src/api/routes.ts',
        },
        mockLogger
      )

      assert.equal(result, false)
    })

    test('should return false when directory filter fails (even if others pass)', () => {
      const filters: InspectorFilters = {
        tags: ['api'],
        types: ['http'],
        directories: ['src/internal'],
      }

      const result = matchesFilters(
        filters,
        { tags: ['api', 'public'] },
        {
          type: 'http',
          name: 'test-route',
          filePath: '/project/src/api/routes.ts',
        },
        mockLogger
      )

      assert.equal(result, false)
    })

    test('should return false when tag filter fails (even if others pass)', () => {
      const filters: InspectorFilters = {
        tags: ['internal'],
        types: ['http'],
        directories: ['src/api'],
      }

      const result = matchesFilters(
        filters,
        { tags: ['api', 'public'] },
        {
          type: 'http',
          name: 'test-route',
          filePath: '/project/src/api/routes.ts',
        },
        mockLogger
      )

      assert.equal(result, false)
    })
  })

  describe('Edge cases', () => {
    test('should handle undefined params', () => {
      const filters: InspectorFilters = {
        tags: ['api'],
      }

      const result = matchesFilters(
        filters,
        { tags: undefined },
        { type: 'http', name: 'test-route' },
        mockLogger
      )

      assert.equal(result, false)
    })

    test('should handle empty meta name', () => {
      const filters: InspectorFilters = {
        types: ['channel'],
      }

      const result = matchesFilters(
        filters,
        { tags: ['test'] },
        { type: 'http', name: '' },
        mockLogger
      )

      assert.equal(result, false)
    })

    test('should handle special characters in paths', () => {
      const filters: InspectorFilters = {
        directories: ['src/api-v2'],
      }

      const result = matchesFilters(
        filters,
        { tags: ['test'] },
        {
          type: 'http',
          name: 'test-route',
          filePath: '/project/src/api-v2/routes.ts',
        },
        mockLogger
      )

      assert.equal(result, true)
    })

    test('should handle case sensitivity in directory paths', () => {
      const filters: InspectorFilters = {
        directories: ['src/API'],
      }

      const result = matchesFilters(
        filters,
        { tags: ['test'] },
        {
          type: 'http',
          name: 'test-route',
          filePath: '/project/src/api/routes.ts',
        },
        mockLogger
      )

      assert.equal(result, false)
    })

    test('should handle multiple matching tags', () => {
      const filters: InspectorFilters = {
        tags: ['api', 'v1'],
      }

      const result = matchesFilters(
        filters,
        { tags: ['api', 'public', 'v1'] },
        { type: 'http', name: 'test-route' },
        mockLogger
      )

      assert.equal(result, true)
    })

    test('should handle multiple matching types', () => {
      const filters: InspectorFilters = {
        types: ['http', 'channel'],
      }

      const result = matchesFilters(
        filters,
        { tags: ['test'] },
        { type: 'channel', name: 'test-channel' },
        mockLogger
      )

      assert.equal(result, true)
    })

    test('should handle multiple matching directories', () => {
      const filters: InspectorFilters = {
        directories: ['src/api', 'src/internal'],
      }

      const result = matchesFilters(
        filters,
        { tags: ['test'] },
        {
          type: 'http',
          name: 'test-route',
          filePath: '/project/src/internal/routes.ts',
        },
        mockLogger
      )

      assert.equal(result, true)
    })
  })

  describe('Name filtering', () => {
    test('should return true when name matches exactly', () => {
      const filters: InspectorFilters = {
        names: ['email-worker', 'notification-worker'],
      }

      const result = matchesFilters(
        filters,
        { name: 'email-worker' },
        { type: 'queue', name: 'email-queue' },
        mockLogger
      )

      assert.equal(result, true)
    })

    test('should return true when name matches with wildcard', () => {
      const filters: InspectorFilters = {
        names: ['email-*'],
      }

      const result = matchesFilters(
        filters,
        { name: 'email-worker' },
        { type: 'queue', name: 'email-queue' },
        mockLogger
      )

      assert.equal(result, true)
    })

    test('should return false when name does not match wildcard', () => {
      const filters: InspectorFilters = {
        names: ['email-*'],
      }

      const result = matchesFilters(
        filters,
        { name: 'notification-worker' },
        { type: 'queue', name: 'notification-queue' },
        mockLogger
      )

      assert.equal(result, false)
    })

    test('should use meta.name when params.name is not provided', () => {
      const filters: InspectorFilters = {
        names: ['test-*'],
      }

      const result = matchesFilters(
        filters,
        {},
        { type: 'http', name: 'test-route' },
        mockLogger
      )

      assert.equal(result, true)
    })

    test('should prefer params.name over meta.name', () => {
      const filters: InspectorFilters = {
        names: ['email-*'],
      }

      const result = matchesFilters(
        filters,
        { name: 'email-worker' },
        { type: 'queue', name: 'other-name' },
        mockLogger
      )

      assert.equal(result, true)
    })
  })

  describe('HTTP route filtering', () => {
    test('should return true when httpRoute matches exactly', () => {
      const filters: InspectorFilters = {
        httpRoutes: ['/api/users', '/api/posts'],
      }

      const result = matchesFilters(
        filters,
        {},
        {
          type: 'http',
          name: 'users-route',
          httpRoute: '/api/users',
        },
        mockLogger
      )

      assert.equal(result, true)
    })

    test('should return true when httpRoute matches with wildcard', () => {
      const filters: InspectorFilters = {
        httpRoutes: ['/api/*'],
      }

      const result = matchesFilters(
        filters,
        {},
        {
          type: 'http',
          name: 'users-route',
          httpRoute: '/api/users',
        },
        mockLogger
      )

      assert.equal(result, true)
    })

    test('should return false when httpRoute does not match wildcard', () => {
      const filters: InspectorFilters = {
        httpRoutes: ['/api/*'],
      }

      const result = matchesFilters(
        filters,
        {},
        {
          type: 'http',
          name: 'webhook-route',
          httpRoute: '/webhooks/stripe',
        },
        mockLogger
      )

      assert.equal(result, false)
    })

    test('should not filter when httpRoute is not provided in meta', () => {
      const filters: InspectorFilters = {
        httpRoutes: ['/api/*'],
      }

      const result = matchesFilters(
        filters,
        {},
        { type: 'queue', name: 'worker' },
        mockLogger
      )

      assert.equal(result, true) // Does not apply to non-HTTP
    })

    test('should match multiple route patterns', () => {
      const filters: InspectorFilters = {
        httpRoutes: ['/api/*', '/webhooks/*'],
      }

      const result = matchesFilters(
        filters,
        {},
        {
          type: 'http',
          name: 'webhook-route',
          httpRoute: '/webhooks/stripe',
        },
        mockLogger
      )

      assert.equal(result, true)
    })
  })

  describe('HTTP method filtering', () => {
    test('should return true when httpMethod matches', () => {
      const filters: InspectorFilters = {
        httpMethods: ['GET', 'POST'],
      }

      const result = matchesFilters(
        filters,
        {},
        {
          type: 'http',
          name: 'users-route',
          httpMethod: 'GET',
        },
        mockLogger
      )

      assert.equal(result, true)
    })

    test('should return false when httpMethod does not match', () => {
      const filters: InspectorFilters = {
        httpMethods: ['GET', 'POST'],
      }

      const result = matchesFilters(
        filters,
        {},
        {
          type: 'http',
          name: 'users-route',
          httpMethod: 'DELETE',
        },
        mockLogger
      )

      assert.equal(result, false)
    })

    test('should handle case-insensitive method matching', () => {
      const filters: InspectorFilters = {
        httpMethods: ['GET', 'POST'],
      }

      const result = matchesFilters(
        filters,
        {},
        {
          type: 'http',
          name: 'users-route',
          httpMethod: 'get',
        },
        mockLogger
      )

      assert.equal(result, true)
    })

    test('should not filter when httpMethod is not provided in meta', () => {
      const filters: InspectorFilters = {
        httpMethods: ['GET'],
      }

      const result = matchesFilters(
        filters,
        {},
        { type: 'queue', name: 'worker' },
        mockLogger
      )

      assert.equal(result, true) // Does not apply to non-HTTP
    })
  })

  describe('Combined filtering with new filters', () => {
    test('should return true when all filters including new ones pass', () => {
      const filters: InspectorFilters = {
        tags: ['api'],
        types: ['http'],
        httpRoutes: ['/api/*'],
        httpMethods: ['GET'],
      }

      const result = matchesFilters(
        filters,
        { tags: ['api'] },
        {
          type: 'http',
          name: 'users-route',
          httpRoute: '/api/users',
          httpMethod: 'GET',
        },
        mockLogger
      )

      assert.equal(result, true)
    })

    test('should return false when httpRoute filter fails', () => {
      const filters: InspectorFilters = {
        tags: ['api'],
        httpRoutes: ['/admin/*'],
      }

      const result = matchesFilters(
        filters,
        { tags: ['api'] },
        {
          type: 'http',
          name: 'users-route',
          httpRoute: '/api/users',
        },
        mockLogger
      )

      assert.equal(result, false)
    })

    test('should return false when httpMethod filter fails', () => {
      const filters: InspectorFilters = {
        httpRoutes: ['/api/*'],
        httpMethods: ['POST'],
      }

      const result = matchesFilters(
        filters,
        {},
        {
          type: 'http',
          name: 'users-route',
          httpRoute: '/api/users',
          httpMethod: 'GET',
        },
        mockLogger
      )

      assert.equal(result, false)
    })
  })
})

describe('matchesWildcard', () => {
  test('should match exact strings', () => {
    assert.equal(matchesWildcard('email-worker', 'email-worker'), true)
    assert.equal(matchesWildcard('test', 'test'), true)
  })

  test('should not match different strings', () => {
    assert.equal(matchesWildcard('email-worker', 'notification-worker'), false)
    assert.equal(matchesWildcard('test', 'other'), false)
  })

  test('should match wildcard prefix', () => {
    assert.equal(matchesWildcard('email-worker', 'email-*'), true)
    assert.equal(matchesWildcard('email-sender', 'email-*'), true)
    assert.equal(matchesWildcard('email', 'email-*'), false) // Needs prefix before *
  })

  test('should match wildcard for routes', () => {
    assert.equal(matchesWildcard('/api/users', '/api/*'), true)
    assert.equal(matchesWildcard('/api/posts', '/api/*'), true)
    assert.equal(matchesWildcard('/webhooks/stripe', '/api/*'), false)
  })

  test('should handle empty prefix with wildcard', () => {
    assert.equal(matchesWildcard('anything', '*'), true)
    assert.equal(matchesWildcard('', '*'), true)
  })

  test('should handle exact match when no wildcard', () => {
    assert.equal(matchesWildcard('test', 'test'), true)
    assert.equal(matchesWildcard('test', 'test*'), false) // Has suffix after exact match
  })

  test('should handle special characters in prefix', () => {
    assert.equal(matchesWildcard('api-v2-users', 'api-v2-*'), true)
    assert.equal(matchesWildcard('api.v2.users', 'api.v2.*'), true)
  })
})
