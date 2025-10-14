import { test, describe } from 'node:test'
import { strict as assert } from 'node:assert'
import { PikkuWiringTypes } from '@pikku/core'
import { InspectorFilters } from '../types'
import { matchesFilters } from './filter-utils'

describe('matchesFilters', () => {
  // Mock logger for testing
  const mockLogger = {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
  }

  describe('Empty filters', () => {
    test('should return true when no filters are provided', () => {
      const filters: InspectorFilters = {}

      const result = matchesFilters(
        filters,
        { tags: ['test'] },
        { type: PikkuWiringTypes.http, name: 'test-route' },
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
        { type: PikkuWiringTypes.http, name: 'test-route' },
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
        { type: PikkuWiringTypes.http, name: 'test-route' },
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
        { type: PikkuWiringTypes.http, name: 'test-route' },
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
        { type: PikkuWiringTypes.http, name: 'test-route' },
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
        { type: PikkuWiringTypes.http, name: 'test-route' },
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
        { type: PikkuWiringTypes.http, name: 'test-route' },
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
        { type: PikkuWiringTypes.http, name: 'test-route' },
        mockLogger
      )

      assert.equal(result, false)
    })

    test('should handle all PikkuWiringTypes correctly', () => {
      const eventTypes = [
        PikkuWiringTypes.http,
        PikkuWiringTypes.channel,
        PikkuWiringTypes.queue,
        PikkuWiringTypes.scheduler,
        PikkuWiringTypes.rpc,
        PikkuWiringTypes.mcp,
      ]

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
          type: PikkuWiringTypes.http,
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
          type: PikkuWiringTypes.http,
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
          type: PikkuWiringTypes.http,
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
          type: PikkuWiringTypes.http,
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
        { type: PikkuWiringTypes.http, name: 'test-route' }, // no filePath
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
          type: PikkuWiringTypes.http,
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
          type: PikkuWiringTypes.http,
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
          type: PikkuWiringTypes.http,
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
          type: PikkuWiringTypes.http,
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
          type: PikkuWiringTypes.http,
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
        { type: PikkuWiringTypes.http, name: 'test-route' },
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
        { type: PikkuWiringTypes.http, name: '' },
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
          type: PikkuWiringTypes.http,
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
          type: PikkuWiringTypes.http,
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
        { type: PikkuWiringTypes.http, name: 'test-route' },
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
        { type: PikkuWiringTypes.channel, name: 'test-channel' },
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
          type: PikkuWiringTypes.http,
          name: 'test-route',
          filePath: '/project/src/internal/routes.ts',
        },
        mockLogger
      )

      assert.equal(result, true)
    })
  })
})
