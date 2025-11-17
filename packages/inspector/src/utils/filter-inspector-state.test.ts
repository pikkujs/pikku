import { test, describe } from 'node:test'
import { strict as assert } from 'node:assert'
import { filterInspectorState } from './filter-inspector-state.js'
import { InspectorState, InspectorFilters } from '../types.js'
import {
  deserializeInspectorState,
  SerializableInspectorState,
} from './serialize-inspector-state.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load the real inspector state from templates/functions
let realState: Omit<InspectorState, 'typesLookup'>
try {
  const stateJson = readFileSync(
    join(__dirname, 'test-data/inspector-state.json'),
    'utf-8'
  )
  const serialized = JSON.parse(stateJson) as SerializableInspectorState
  realState = deserializeInspectorState(serialized)
} catch (e) {
  console.error('Failed to load real inspector state:', e)
  throw e
}

// Helper to create a minimal mock InspectorState for testing (kept for compatibility)
function createMockInspectorState(): Omit<InspectorState, 'typesLookup'> {
  return {
    rootDir: '/test/project',
    singletonServicesTypeImportMap: new Map(),
    interactionServicesTypeImportMap: new Map(),
    userSessionTypeImportMap: new Map(),
    configTypeImportMap: new Map(),
    singletonServicesFactories: new Map(),
    interactionServicesFactories: new Map(),
    interactionServicesMeta: new Map(),
    configFactories: new Map(),
    filesAndMethods: {},
    filesAndMethodsErrors: new Map(),
    http: {
      metaInputTypes: new Map(),
      meta: {
        get: {
          '/api/users': {
            pikkuFuncName: 'getUsers',
            route: '/api/users',
            method: 'GET',
            tags: ['api', 'public'],
            middleware: [],
            permissions: [],
          },
          '/admin/settings': {
            pikkuFuncName: 'getAdminSettings',
            route: '/admin/settings',
            method: 'GET',
            tags: ['admin'],
            middleware: [{ type: 'wire', name: 'authMiddleware' }],
            permissions: [{ type: 'wire', name: 'adminPermission' }],
          },
        },
        post: {
          '/api/users': {
            pikkuFuncName: 'createUser',
            route: '/api/users',
            method: 'POST',
            tags: ['api'],
            middleware: [],
            permissions: [],
          },
        },
        put: {},
        patch: {},
        delete: {},
        head: {},
        options: {},
      },
      files: new Set(['/test/project/src/api/users.ts']),
      routeMiddleware: new Map(),
      routePermissions: new Map(),
    },
    functions: {
      typesMap: new Map(),
      meta: {
        getUsers: {
          services: [],
          optimized: false,
        },
        createUser: {
          services: [],
          optimized: false,
        },
        getAdminSettings: {
          services: [],
          optimized: false,
        },
        sendEmailWorker: {
          services: [],
          optimized: false,
        },
        dailyReport: {
          services: [],
          optimized: false,
        },
        mcpSearchTool: {
          services: [],
          optimized: false,
        },
        cliCommand: {
          services: [],
          optimized: false,
        },
      },
      files: new Map([
        [
          'getUsers',
          { path: '/test/project/src/api/users.ts', exportedName: 'getUsers' },
        ],
        [
          'createUser',
          {
            path: '/test/project/src/api/users.ts',
            exportedName: 'createUser',
          },
        ],
        [
          'getAdminSettings',
          {
            path: '/test/project/src/admin/settings.ts',
            exportedName: 'getAdminSettings',
          },
        ],
        [
          'sendEmailWorker',
          {
            path: '/test/project/src/workers/email.ts',
            exportedName: 'sendEmailWorker',
          },
        ],
        [
          'dailyReport',
          {
            path: '/test/project/src/tasks/reports.ts',
            exportedName: 'dailyReport',
          },
        ],
      ]),
    },
    channels: {
      meta: {
        'chat-channel': {
          pikkuFuncName: 'handleChatMessage',
          tags: ['realtime', 'public'],
          middleware: [],
          permissions: [],
        },
        'admin-channel': {
          pikkuFuncName: 'handleAdminMessage',
          tags: ['realtime', 'admin'],
          middleware: [{ type: 'wire', name: 'authMiddleware' }],
          permissions: [],
        },
      },
      files: new Set(['/test/project/src/channels/chat.ts']),
    },
    scheduledTasks: {
      meta: {
        'daily-report': {
          pikkuFuncName: 'dailyReport',
          schedule: '0 0 * * *',
          tags: ['cron', 'reports'],
          middleware: [],
        },
        'hourly-cleanup': {
          pikkuFuncName: 'hourlyCleanup',
          schedule: '0 * * * *',
          tags: ['cron', 'maintenance'],
          middleware: [],
        },
      },
      files: new Set(['/test/project/src/tasks/reports.ts']),
    },
    queueWorkers: {
      meta: {
        'email-worker': {
          pikkuFuncName: 'sendEmailWorker',
          queueName: 'email-queue',
          tags: ['queue', 'email'],
          middleware: [],
        },
        'notification-worker': {
          pikkuFuncName: 'sendNotificationWorker',
          queueName: 'notification-queue',
          tags: ['queue', 'notifications'],
          middleware: [],
        },
      },
      files: new Set(['/test/project/src/workers/email.ts']),
    },
    rpc: {
      internalMeta: {},
      internalFiles: new Map(),
      exposedMeta: {},
      exposedFiles: new Map(),
      invokedFunctions: new Set(),
    },
    mcpEndpoints: {
      toolsMeta: {
        'search-tool': {
          name: 'search-tool',
          description: 'Search tool',
          pikkuFuncName: 'mcpSearchTool',
          tags: ['mcp', 'search'],
          middleware: [],
          permissions: [],
        } as any,
        'analyze-tool': {
          name: 'analyze-tool',
          description: 'Analyze tool',
          pikkuFuncName: 'mcpAnalyzeTool',
          tags: ['mcp', 'analytics'],
          middleware: [],
          permissions: [],
        } as any,
      },
      resourcesMeta: {
        'docs-resource': {
          title: 'Docs Resource',
          description: 'Documentation resource',
          uri: 'docs://resource',
          pikkuFuncName: 'mcpDocsResource',
          tags: ['mcp', 'docs'],
          middleware: [],
          permissions: [],
        } as any,
      },
      promptsMeta: {
        'help-prompt': {
          name: 'help-prompt',
          description: 'Help prompt',
          pikkuFuncName: 'mcpHelpPrompt',
          tags: ['mcp', 'help'],
          middleware: [],
          permissions: [],
        } as any,
      },
      files: new Set(['/test/project/src/mcp/tools.ts']),
    },
    cli: {
      meta: {
        programs: {
          'my-cli': {
            commands: {
              build: {
                pikkuFuncName: 'cliCommand',
                tags: ['cli', 'build'],
                middleware: [],
                positionals: [],
                options: {},
              } as any,
              test: {
                pikkuFuncName: 'cliTestCommand',
                tags: ['cli', 'test'],
                middleware: [],
                positionals: [],
                options: {},
              } as any,
            },
          },
        },
      },
      files: new Set(['/test/project/src/cli/commands.ts']),
    },
    middleware: {
      meta: {},
      tagMiddleware: new Map(),
    },
    permissions: {
      meta: {},
      tagPermissions: new Map(),
    },
    serviceAggregation: {
      requiredServices: new Set(),
      usedFunctions: new Set(),
      usedMiddleware: new Set(),
      usedPermissions: new Set(),
    },
  }
}

// Mock logger for testing
const mockLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
  critical: () => {},
  hasCriticalErrors: () => false,
}

describe('filterInspectorState', () => {
  describe('No filters - returns original state', () => {
    test('should return original state when no filters provided', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {}

      const result = filterInspectorState(state, filters, mockLogger)

      assert.equal(result, state) // Should be the same reference
    })

    test('should return original state when all filter arrays are empty', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        names: [],
        tags: [],
        types: [],
        directories: [],
        httpRoutes: [],
        httpMethods: [],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.equal(result, state)
    })
  })

  describe('HTTP filtering', () => {
    test('should filter HTTP routes by type', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        types: ['channel'], // Only channels, not HTTP
      }

      const result = filterInspectorState(state, filters, mockLogger)

      // HTTP routes should be empty
      assert.equal(Object.keys(result.http.meta.get).length, 0)
      assert.equal(Object.keys(result.http.meta.post).length, 0)

      // Channels should still exist
      assert.equal(Object.keys(result.channels.meta).length, 2)
    })

    test('should filter HTTP routes by tags', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        types: ['http'],
        tags: ['admin'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      // Only admin route should remain
      assert.equal(Object.keys(result.http.meta.get).length, 1)
      assert.ok(result.http.meta.get['/admin/settings'])
      assert.equal(Object.keys(result.http.meta.post).length, 0)
    })

    test('should filter HTTP routes by httpMethod', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        httpMethods: ['GET'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      // Only GET routes should remain
      assert.equal(Object.keys(result.http.meta.get).length, 2)
      assert.equal(Object.keys(result.http.meta.post).length, 0)
    })

    test('should filter HTTP routes by httpRoute pattern', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        httpRoutes: ['/api/*'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      // Only /api/* routes should remain
      assert.ok(result.http.meta.get['/api/users'])
      assert.ok(result.http.meta.post['/api/users'])
      assert.ok(!result.http.meta.get['/admin/settings'])
    })

    test('should filter HTTP routes by directory', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        types: ['http'],
        directories: ['src/admin'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      // Only admin routes should remain
      assert.equal(Object.keys(result.http.meta.get).length, 1)
      assert.ok(result.http.meta.get['/admin/settings'])
    })

    test('should filter HTTP routes by function name', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        types: ['http'],
        names: ['getUsers'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.equal(Object.keys(result.http.meta.get).length, 1)
      assert.ok(result.http.meta.get['/api/users'])
      assert.equal(result.http.meta.get['/api/users'].pikkuFuncName, 'getUsers')
    })

    test('should filter HTTP routes by name wildcard', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        types: ['http'],
        names: ['get*'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      // Should match getUsers and getAdminSettings
      assert.equal(Object.keys(result.http.meta.get).length, 2)
      assert.equal(Object.keys(result.http.meta.post).length, 0)
    })

    test('should track middleware and permissions for filtered HTTP routes', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        types: ['http'],
        tags: ['admin'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      // Check that service aggregation includes the middleware and permissions
      assert.ok(result.serviceAggregation.usedMiddleware.has('authMiddleware'))
      assert.ok(
        result.serviceAggregation.usedPermissions.has('adminPermission')
      )
      assert.ok(result.serviceAggregation.usedFunctions.has('getAdminSettings'))
    })
  })

  describe('Channel filtering', () => {
    test('should filter channels by type', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        types: ['channel'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      // Channels should exist
      assert.equal(Object.keys(result.channels.meta).length, 2)

      // HTTP routes should be empty
      assert.equal(Object.keys(result.http.meta.get).length, 0)
      assert.equal(Object.keys(result.http.meta.post).length, 0)
    })

    test('should filter channels by tags', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        types: ['channel'],
        tags: ['admin'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.equal(Object.keys(result.channels.meta).length, 1)
      assert.ok(result.channels.meta['admin-channel'])
    })

    test('should filter channels by name', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        names: ['chat-channel'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.equal(Object.keys(result.channels.meta).length, 1)
      assert.ok(result.channels.meta['chat-channel'])
    })

    test('should filter channels by name wildcard', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        names: ['*-channel'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.equal(Object.keys(result.channels.meta).length, 2)
    })

    test('should track middleware for filtered channels', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        types: ['channel'],
        tags: ['admin'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.ok(result.serviceAggregation.usedMiddleware.has('authMiddleware'))
      assert.ok(
        result.serviceAggregation.usedFunctions.has('handleAdminMessage')
      )
    })
  })

  describe('Scheduled task filtering', () => {
    test('should filter scheduled tasks by type', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        types: ['scheduler'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.equal(Object.keys(result.scheduledTasks.meta).length, 2)

      // Other types should be empty
      assert.equal(Object.keys(result.http.meta.get).length, 0)
      assert.equal(Object.keys(result.channels.meta).length, 0)
    })

    test('should filter scheduled tasks by tags', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        types: ['scheduler'],
        tags: ['reports'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.equal(Object.keys(result.scheduledTasks.meta).length, 1)
      assert.ok(result.scheduledTasks.meta['daily-report'])
    })

    test('should filter scheduled tasks by name', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        names: ['daily-report'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.equal(Object.keys(result.scheduledTasks.meta).length, 1)
      assert.ok(result.scheduledTasks.meta['daily-report'])
    })

    test('should filter scheduled tasks by name wildcard', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        names: ['*-cleanup'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.equal(Object.keys(result.scheduledTasks.meta).length, 1)
      assert.ok(result.scheduledTasks.meta['hourly-cleanup'])
    })

    test('should track functions for filtered scheduled tasks', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        types: ['scheduler'],
        tags: ['reports'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.ok(result.serviceAggregation.usedFunctions.has('dailyReport'))
    })
  })

  describe('Queue worker filtering', () => {
    test('should filter queue workers by type', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        types: ['queue'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.equal(Object.keys(result.queueWorkers.meta).length, 2)

      // Other types should be empty
      assert.equal(Object.keys(result.http.meta.get).length, 0)
      assert.equal(Object.keys(result.channels.meta).length, 0)
    })

    test('should filter queue workers by tags', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        types: ['queue'],
        tags: ['email'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.equal(Object.keys(result.queueWorkers.meta).length, 1)
      assert.ok(result.queueWorkers.meta['email-worker'])
    })

    test('should filter queue workers by name', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        names: ['email-worker'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.equal(Object.keys(result.queueWorkers.meta).length, 1)
      assert.ok(result.queueWorkers.meta['email-worker'])
    })

    test('should filter queue workers by name wildcard', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        names: ['*-worker'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.equal(Object.keys(result.queueWorkers.meta).length, 2)
    })

    test('should track functions for filtered queue workers', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        types: ['queue'],
        tags: ['email'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.ok(result.serviceAggregation.usedFunctions.has('sendEmailWorker'))
    })
  })

  describe('MCP endpoint filtering', () => {
    test('should filter MCP tools by type', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        types: ['mcp'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.equal(Object.keys(result.mcpEndpoints.toolsMeta).length, 2)
      assert.equal(Object.keys(result.mcpEndpoints.resourcesMeta).length, 1)
      assert.equal(Object.keys(result.mcpEndpoints.promptsMeta).length, 1)

      // Other types should be empty
      assert.equal(Object.keys(result.http.meta.get).length, 0)
    })

    test('should filter MCP endpoints by tags', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        types: ['mcp'],
        tags: ['search'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.equal(Object.keys(result.mcpEndpoints.toolsMeta).length, 1)
      assert.ok(result.mcpEndpoints.toolsMeta['search-tool'])
      assert.equal(Object.keys(result.mcpEndpoints.resourcesMeta).length, 0)
    })

    test('should filter MCP endpoints by name', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        names: ['search-tool'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.equal(Object.keys(result.mcpEndpoints.toolsMeta).length, 1)
      assert.ok(result.mcpEndpoints.toolsMeta['search-tool'])
    })

    test('should filter MCP endpoints by name wildcard', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        names: ['*-tool'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.equal(Object.keys(result.mcpEndpoints.toolsMeta).length, 2)
      assert.equal(Object.keys(result.mcpEndpoints.resourcesMeta).length, 0)
      assert.equal(Object.keys(result.mcpEndpoints.promptsMeta).length, 0)
    })

    test('should track functions for filtered MCP endpoints', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        types: ['mcp'],
        tags: ['search'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.ok(result.serviceAggregation.usedFunctions.has('mcpSearchTool'))
    })
  })

  describe('CLI filtering', () => {
    test('should filter CLI commands by type', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        types: ['cli'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.equal(
        Object.keys(result.cli.meta.programs['my-cli'].commands).length,
        2
      )

      // Other types should be empty
      assert.equal(Object.keys(result.http.meta.get).length, 0)
    })

    test('should filter CLI commands by tags', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        types: ['cli'],
        tags: ['build'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.equal(
        Object.keys(result.cli.meta.programs['my-cli'].commands).length,
        1
      )
      assert.ok(result.cli.meta.programs['my-cli'].commands['build'])
    })

    test('should filter CLI commands by name', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        names: ['build'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.equal(
        Object.keys(result.cli.meta.programs['my-cli'].commands).length,
        1
      )
      assert.ok(result.cli.meta.programs['my-cli'].commands['build'])
    })

    test('should remove program if all commands are filtered out', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        types: ['cli'],
        tags: ['non-existent'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      // Program should be removed
      assert.equal(Object.keys(result.cli.meta.programs).length, 0)
    })

    test('should track functions for filtered CLI commands', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        types: ['cli'],
        tags: ['build'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.ok(result.serviceAggregation.usedFunctions.has('cliCommand'))
    })
  })

  describe('Combined filtering', () => {
    test('should filter multiple types at once', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        types: ['http', 'channel'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      // HTTP and channels should exist
      assert.equal(Object.keys(result.http.meta.get).length, 2)
      assert.equal(Object.keys(result.channels.meta).length, 2)

      // Other types should be empty
      assert.equal(Object.keys(result.scheduledTasks.meta).length, 0)
      assert.equal(Object.keys(result.queueWorkers.meta).length, 0)
    })

    test('should filter by tags across all types', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        tags: ['admin'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      // Only admin-tagged items should remain
      assert.equal(Object.keys(result.http.meta.get).length, 1)
      assert.ok(result.http.meta.get['/admin/settings'])
      assert.equal(Object.keys(result.channels.meta).length, 1)
      assert.ok(result.channels.meta['admin-channel'])
      assert.equal(Object.keys(result.scheduledTasks.meta).length, 0)
    })

    test('should handle complex combined filters', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        types: ['http'],
        tags: ['api'],
        httpMethods: ['POST'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      // Only POST /api/users should remain
      assert.equal(Object.keys(result.http.meta.get).length, 0)
      assert.equal(Object.keys(result.http.meta.post).length, 1)
      assert.ok(result.http.meta.post['/api/users'])
    })
  })

  describe('Service aggregation', () => {
    test('should reset and recalculate service aggregation', () => {
      const state = createMockInspectorState()

      // Pre-populate with some old data
      state.serviceAggregation.usedFunctions.add('oldFunction')
      state.serviceAggregation.usedMiddleware.add('oldMiddleware')

      const filters: InspectorFilters = {
        types: ['http'],
        tags: ['admin'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      // Old data should be gone, new data should be present
      assert.ok(!result.serviceAggregation.usedFunctions.has('oldFunction'))
      assert.ok(!result.serviceAggregation.usedMiddleware.has('oldMiddleware'))
      assert.ok(result.serviceAggregation.usedFunctions.has('getAdminSettings'))
      assert.ok(result.serviceAggregation.usedMiddleware.has('authMiddleware'))
    })

    test('should track all used functions across different wiring types', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        tags: ['admin'], // Filter for admin-tagged items across all types
      }

      const result = filterInspectorState(state, filters, mockLogger)

      // Should include functions from HTTP and channels
      assert.ok(result.serviceAggregation.usedFunctions.has('getAdminSettings'))
      assert.ok(
        result.serviceAggregation.usedFunctions.has('handleAdminMessage')
      )
    })
  })

  describe('State immutability', () => {
    test('should not mutate original state when filtering', () => {
      const state = createMockInspectorState()
      const originalHttpCount = Object.keys(state.http.meta.get).length
      const originalChannelCount = Object.keys(state.channels.meta).length

      const filters: InspectorFilters = {
        types: ['http'],
      }

      filterInspectorState(state, filters, mockLogger)

      // Original state should not be modified
      assert.equal(Object.keys(state.http.meta.get).length, originalHttpCount)
      assert.equal(
        Object.keys(state.channels.meta).length,
        originalChannelCount
      )
    })

    test('should create deep copies of metadata', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        types: ['http'],
        tags: ['api'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      // Modify filtered state
      delete result.http.meta.get['/api/users']

      // Original should still have the route
      assert.ok(state.http.meta.get['/api/users'])
    })
  })

  describe('Edge cases', () => {
    test('should handle empty state', () => {
      const state = createMockInspectorState()
      state.http.meta = {
        get: {},
        post: {},
        put: {},
        patch: {},
        delete: {},
        head: {},
        options: {},
      }
      state.channels.meta = {}
      state.scheduledTasks.meta = {}
      state.queueWorkers.meta = {}

      const filters: InspectorFilters = {
        types: ['http'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.equal(Object.keys(result.http.meta.get).length, 0)
    })

    test('should handle filters that match nothing', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        tags: ['non-existent-tag'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      // Everything should be filtered out
      assert.equal(Object.keys(result.http.meta.get).length, 0)
      assert.equal(Object.keys(result.channels.meta).length, 0)
      assert.equal(Object.keys(result.scheduledTasks.meta).length, 0)
      assert.equal(Object.keys(result.queueWorkers.meta).length, 0)
    })

    test('should handle missing optional metadata fields', () => {
      const state = createMockInspectorState()
      // Remove tags from one route
      delete state.http.meta.get['/api/users'].tags

      const filters: InspectorFilters = {
        tags: ['api'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      // Route without tags should not match
      assert.ok(!result.http.meta.get['/api/users'])
      // Route with tags should match
      assert.ok(result.http.meta.post['/api/users'])
    })
  })

  describe('Real data tests (from templates/functions)', () => {
    test('should have loaded real state correctly', () => {
      assert.ok(realState)
      assert.ok(realState.http)
      assert.ok(realState.functions)
      assert.ok(realState.channels)
      assert.ok(realState.scheduledTasks)
      assert.ok(realState.queueWorkers)
      assert.ok(realState.mcpEndpoints)
      assert.ok(realState.cli)
    })

    test('should filter HTTP routes by type in real data', () => {
      // BEFORE: Check what we have in the real state
      const beforeHttpCount = Object.values(
        realState.http.meta as Record<string, any>
      ).flatMap((m) => Object.keys(m)).length
      const beforeChannelCount = Object.keys(realState.channels.meta).length
      const beforeTaskCount = Object.keys(realState.scheduledTasks.meta).length
      const beforeQueueCount = Object.keys(realState.queueWorkers.meta).length

      assert.ok(beforeHttpCount > 0, 'Real state should have HTTP routes')
      assert.ok(beforeChannelCount > 0, 'Real state should have channels')
      assert.ok(beforeTaskCount > 0, 'Real state should have scheduled tasks')
      assert.ok(beforeQueueCount > 0, 'Real state should have queue workers')

      // FILTER: Apply HTTP type filter
      const filters: InspectorFilters = {
        types: ['http'],
      }
      const result = filterInspectorState(realState, filters, mockLogger)

      // AFTER: Check filtered result
      const afterHttpCount = Object.values(
        result.http.meta as Record<string, any>
      ).flatMap((m) => Object.keys(m)).length
      const afterChannelCount = Object.keys(result.channels.meta).length
      const afterTaskCount = Object.keys(result.scheduledTasks.meta).length
      const afterQueueCount = Object.keys(result.queueWorkers.meta).length

      // HTTP routes should remain
      assert.equal(
        afterHttpCount,
        beforeHttpCount,
        'HTTP routes should be preserved'
      )

      // Other types should be filtered out
      assert.equal(afterChannelCount, 0, 'Channels should be filtered out')
      assert.equal(afterTaskCount, 0, 'Scheduled tasks should be filtered out')
      assert.equal(afterQueueCount, 0, 'Queue workers should be filtered out')
    })

    test('should filter channels by type in real data', () => {
      const filters: InspectorFilters = {
        types: ['channel'],
      }

      const result = filterInspectorState(realState, filters, mockLogger)

      // Should have channels
      assert.ok(
        Object.keys(result.channels.meta).length > 0,
        'Should have channels'
      )

      // Other types should be filtered out
      const httpRouteCount = Object.values(result.http.meta).flatMap((m) =>
        Object.keys(m)
      ).length
      assert.equal(httpRouteCount, 0)
      assert.equal(Object.keys(result.scheduledTasks.meta).length, 0)
      assert.equal(Object.keys(result.queueWorkers.meta).length, 0)
    })

    test('should filter scheduler tasks by type in real data', () => {
      // BEFORE: Check what we have in the real state
      const beforeHttpCount = Object.values(
        realState.http.meta as Record<string, any>
      ).flatMap((m) => Object.keys(m)).length
      const beforeChannelCount = Object.keys(realState.channels.meta).length
      const beforeTaskCount = Object.keys(realState.scheduledTasks.meta).length
      const beforeQueueCount = Object.keys(realState.queueWorkers.meta).length

      assert.ok(beforeHttpCount > 0, 'Real state should have HTTP routes')
      assert.ok(beforeChannelCount > 0, 'Real state should have channels')
      assert.ok(beforeTaskCount > 0, 'Real state should have scheduled tasks')
      assert.ok(beforeQueueCount > 0, 'Real state should have queue workers')

      // FILTER: Apply scheduler type filter
      const filters: InspectorFilters = {
        types: ['scheduler'],
      }
      const result = filterInspectorState(realState, filters, mockLogger)

      // AFTER: Check filtered result
      const afterHttpCount = Object.values(
        result.http.meta as Record<string, any>
      ).flatMap((m) => Object.keys(m)).length
      const afterChannelCount = Object.keys(result.channels.meta).length
      const afterTaskCount = Object.keys(result.scheduledTasks.meta).length
      const afterQueueCount = Object.keys(result.queueWorkers.meta).length

      // Scheduled tasks should remain
      assert.equal(
        afterTaskCount,
        beforeTaskCount,
        'Scheduled tasks should be preserved'
      )

      // Other types should be filtered out
      assert.equal(afterHttpCount, 0, 'HTTP routes should be filtered out')
      assert.equal(afterChannelCount, 0, 'Channels should be filtered out')
      assert.equal(afterQueueCount, 0, 'Queue workers should be filtered out')
    })

    test('should filter queue workers by type in real data', () => {
      // BEFORE: Check what we have in the real state
      const beforeHttpCount = Object.values(
        realState.http.meta as Record<string, any>
      ).flatMap((m) => Object.keys(m)).length
      const beforeChannelCount = Object.keys(realState.channels.meta).length
      const beforeTaskCount = Object.keys(realState.scheduledTasks.meta).length
      const beforeQueueCount = Object.keys(realState.queueWorkers.meta).length

      assert.ok(beforeHttpCount > 0, 'Real state should have HTTP routes')
      assert.ok(beforeChannelCount > 0, 'Real state should have channels')
      assert.ok(beforeTaskCount > 0, 'Real state should have scheduled tasks')
      assert.ok(beforeQueueCount > 0, 'Real state should have queue workers')

      // FILTER: Apply queue type filter
      const filters: InspectorFilters = {
        types: ['queue'],
      }
      const result = filterInspectorState(realState, filters, mockLogger)

      // AFTER: Check filtered result
      const afterHttpCount = Object.values(
        result.http.meta as Record<string, any>
      ).flatMap((m) => Object.keys(m)).length
      const afterChannelCount = Object.keys(result.channels.meta).length
      const afterTaskCount = Object.keys(result.scheduledTasks.meta).length
      const afterQueueCount = Object.keys(result.queueWorkers.meta).length

      // Queue workers should remain
      assert.equal(
        afterQueueCount,
        beforeQueueCount,
        'Queue workers should be preserved'
      )

      // Other types should be filtered out
      assert.equal(afterHttpCount, 0, 'HTTP routes should be filtered out')
      assert.equal(afterChannelCount, 0, 'Channels should be filtered out')
      assert.equal(afterTaskCount, 0, 'Scheduled tasks should be filtered out')
    })

    test('should filter MCP endpoints by type in real data', () => {
      // BEFORE: Check what we have in the real state
      const beforeHttpCount = Object.values(
        realState.http.meta as Record<string, any>
      ).flatMap((m) => Object.keys(m)).length
      const beforeChannelCount = Object.keys(realState.channels.meta).length
      const beforeTaskCount = Object.keys(realState.scheduledTasks.meta).length
      const beforeQueueCount = Object.keys(realState.queueWorkers.meta).length
      const beforeMcpToolsCount = Object.keys(
        realState.mcpEndpoints.toolsMeta
      ).length
      const beforeMcpResourcesCount = Object.keys(
        realState.mcpEndpoints.resourcesMeta
      ).length
      const beforeMcpPromptsCount = Object.keys(
        realState.mcpEndpoints.promptsMeta
      ).length

      assert.ok(beforeHttpCount > 0, 'Real state should have HTTP routes')
      assert.ok(beforeChannelCount > 0, 'Real state should have channels')
      assert.ok(beforeTaskCount > 0, 'Real state should have scheduled tasks')
      assert.ok(beforeQueueCount > 0, 'Real state should have queue workers')
      assert.ok(
        beforeMcpToolsCount + beforeMcpResourcesCount + beforeMcpPromptsCount >
          0,
        'Real state should have MCP endpoints'
      )

      // FILTER: Apply MCP type filter
      const filters: InspectorFilters = {
        types: ['mcp'],
      }
      const result = filterInspectorState(realState, filters, mockLogger)

      // AFTER: Check filtered result
      const afterHttpCount = Object.values(
        result.http.meta as Record<string, any>
      ).flatMap((m) => Object.keys(m)).length
      const afterChannelCount = Object.keys(result.channels.meta).length
      const afterTaskCount = Object.keys(result.scheduledTasks.meta).length
      const afterQueueCount = Object.keys(result.queueWorkers.meta).length
      const afterMcpToolsCount = Object.keys(
        result.mcpEndpoints.toolsMeta
      ).length
      const afterMcpResourcesCount = Object.keys(
        result.mcpEndpoints.resourcesMeta
      ).length
      const afterMcpPromptsCount = Object.keys(
        result.mcpEndpoints.promptsMeta
      ).length

      // MCP endpoints should remain
      assert.equal(
        afterMcpToolsCount,
        beforeMcpToolsCount,
        'MCP tools should be preserved'
      )
      assert.equal(
        afterMcpResourcesCount,
        beforeMcpResourcesCount,
        'MCP resources should be preserved'
      )
      assert.equal(
        afterMcpPromptsCount,
        beforeMcpPromptsCount,
        'MCP prompts should be preserved'
      )

      // Other types should be filtered out
      assert.equal(afterHttpCount, 0, 'HTTP routes should be filtered out')
      assert.equal(afterChannelCount, 0, 'Channels should be filtered out')
      assert.equal(afterTaskCount, 0, 'Scheduled tasks should be filtered out')
      assert.equal(afterQueueCount, 0, 'Queue workers should be filtered out')
    })

    test('should filter CLI programs by type in real data', () => {
      // BEFORE: Check what we have in the real state
      const beforeHttpCount = Object.values(
        realState.http.meta as Record<string, any>
      ).flatMap((m) => Object.keys(m)).length
      const beforeChannelCount = Object.keys(realState.channels.meta).length
      const beforeTaskCount = Object.keys(realState.scheduledTasks.meta).length
      const beforeQueueCount = Object.keys(realState.queueWorkers.meta).length
      const beforeCliProgramCount = Object.keys(
        realState.cli.meta.programs
      ).length

      assert.ok(beforeHttpCount > 0, 'Real state should have HTTP routes')
      assert.ok(beforeChannelCount > 0, 'Real state should have channels')
      assert.ok(beforeTaskCount > 0, 'Real state should have scheduled tasks')
      assert.ok(beforeQueueCount > 0, 'Real state should have queue workers')
      assert.ok(
        beforeCliProgramCount > 0,
        'Real state should have CLI programs'
      )

      // FILTER: Apply CLI type filter
      const filters: InspectorFilters = {
        types: ['cli'],
      }
      const result = filterInspectorState(realState, filters, mockLogger)

      // AFTER: Check filtered result
      const afterHttpCount = Object.values(
        result.http.meta as Record<string, any>
      ).flatMap((m) => Object.keys(m)).length
      const afterChannelCount = Object.keys(result.channels.meta).length
      const afterTaskCount = Object.keys(result.scheduledTasks.meta).length
      const afterQueueCount = Object.keys(result.queueWorkers.meta).length
      const afterCliProgramCount = Object.keys(result.cli.meta.programs).length

      // CLI programs should remain
      assert.equal(
        afterCliProgramCount,
        beforeCliProgramCount,
        'CLI programs should be preserved'
      )

      // Other types should be filtered out
      assert.equal(afterHttpCount, 0, 'HTTP routes should be filtered out')
      assert.equal(afterChannelCount, 0, 'Channels should be filtered out')
      assert.equal(afterTaskCount, 0, 'Scheduled tasks should be filtered out')
      assert.equal(afterQueueCount, 0, 'Queue workers should be filtered out')
    })

    test('should filter by HTTP method in real data', () => {
      // BEFORE: Check what HTTP methods exist
      const beforeGetCount = Object.keys(realState.http.meta.get || {}).length
      const beforePostCount = Object.keys(realState.http.meta.post || {}).length
      const beforePutCount = Object.keys(realState.http.meta.put || {}).length
      const beforeDeleteCount = Object.keys(
        realState.http.meta.delete || {}
      ).length

      assert.ok(
        beforeGetCount + beforePostCount + beforePutCount + beforeDeleteCount >
          0,
        'Real state should have HTTP routes'
      )

      // FILTER: Apply GET method filter
      const filters: InspectorFilters = {
        types: ['http'],
        httpMethods: ['GET'],
      }
      const result = filterInspectorState(realState, filters, mockLogger)

      // AFTER: Check filtered result
      const afterGetCount = Object.keys(result.http.meta.get || {}).length
      const afterPostCount = Object.keys(result.http.meta.post || {}).length
      const afterPutCount = Object.keys(result.http.meta.put || {}).length
      const afterDeleteCount = Object.keys(result.http.meta.delete || {}).length

      // GET routes should remain
      assert.equal(
        afterGetCount,
        beforeGetCount,
        'GET routes should be preserved'
      )

      // Other methods should be filtered out
      assert.equal(afterPostCount, 0, 'POST routes should be filtered out')
      assert.equal(afterPutCount, 0, 'PUT routes should be filtered out')
      assert.equal(afterDeleteCount, 0, 'DELETE routes should be filtered out')
    })

    test('should filter by name pattern in real data', () => {
      // BEFORE: Count all endpoints
      const beforeHttpCount = Object.values(
        realState.http.meta as Record<string, any>
      ).flatMap((m) => Object.keys(m)).length
      const beforeChannelCount = Object.keys(realState.channels.meta).length
      const beforeTaskCount = Object.keys(realState.scheduledTasks.meta).length
      const beforeQueueCount = Object.keys(realState.queueWorkers.meta).length
      const beforeTotal =
        beforeHttpCount +
        beforeChannelCount +
        beforeTaskCount +
        beforeQueueCount

      assert.ok(beforeTotal > 0, 'Real state should have endpoints')

      // FILTER: Apply name pattern filter for functions with "http" in their name
      const filters: InspectorFilters = {
        names: ['*http*'],
      }
      const result = filterInspectorState(realState, filters, mockLogger)

      // AFTER: Count all filtered endpoints
      const afterHttpCount = Object.values(
        result.http.meta as Record<string, any>
      ).flatMap((m) => Object.keys(m)).length
      const afterChannelCount = Object.keys(result.channels.meta).length
      const afterTaskCount = Object.keys(result.scheduledTasks.meta).length
      const afterQueueCount = Object.keys(result.queueWorkers.meta).length
      const afterTotal =
        afterHttpCount + afterChannelCount + afterTaskCount + afterQueueCount

      // After filtering by name pattern, we should have fewer or equal items
      assert.ok(
        afterTotal <= beforeTotal,
        'Filtered count should be less than or equal to original'
      )
    })

    test('should not mutate real state when filtering', () => {
      const originalHttpCount = Object.values(
        realState.http.meta as Record<string, any>
      ).flatMap((m) => Object.keys(m)).length
      const originalChannelCount = Object.keys(realState.channels.meta).length

      const filters: InspectorFilters = {
        types: ['http'],
      }

      filterInspectorState(realState, filters, mockLogger)

      // Original should not be modified
      const afterHttpCount = Object.values(
        realState.http.meta as Record<string, any>
      ).flatMap((m) => Object.keys(m)).length
      const afterChannelCount = Object.keys(realState.channels.meta).length

      assert.equal(afterHttpCount, originalHttpCount)
      assert.equal(afterChannelCount, originalChannelCount)
    })

    test('should aggregate services correctly with real data', () => {
      const filters: InspectorFilters = {
        types: ['http'],
      }

      const result = filterInspectorState(realState, filters, mockLogger)

      // Service aggregation should be recalculated
      assert.ok(result.serviceAggregation)
      assert.ok(result.serviceAggregation.usedFunctions instanceof Set)
      assert.ok(result.serviceAggregation.usedMiddleware instanceof Set)
      assert.ok(result.serviceAggregation.usedPermissions instanceof Set)
      assert.ok(result.serviceAggregation.requiredServices instanceof Set)
    })

    test('should handle combined filters with real data', () => {
      // BEFORE: Check what we have
      const beforeGetCount = Object.keys(realState.http.meta.get || {}).length
      const beforePostCount = Object.keys(realState.http.meta.post || {}).length
      const beforePutCount = Object.keys(realState.http.meta.put || {}).length
      const beforeChannelCount = Object.keys(realState.channels.meta).length
      const beforeTaskCount = Object.keys(realState.scheduledTasks.meta).length
      const beforeQueueCount = Object.keys(realState.queueWorkers.meta).length

      assert.ok(
        beforeGetCount + beforePostCount > 0,
        'Real state should have GET/POST routes'
      )
      assert.ok(beforeChannelCount > 0, 'Real state should have channels')

      // FILTER: Apply combined filters (HTTP and channels, GET/POST methods only)
      const filters: InspectorFilters = {
        types: ['http', 'channel'],
        httpMethods: ['GET', 'POST'],
      }
      const result = filterInspectorState(realState, filters, mockLogger)

      // AFTER: Check filtered result
      const afterGetCount = Object.keys(result.http.meta.get || {}).length
      const afterPostCount = Object.keys(result.http.meta.post || {}).length
      const afterPutCount = Object.keys(result.http.meta.put || {}).length
      const afterChannelCount = Object.keys(result.channels.meta).length
      const afterTaskCount = Object.keys(result.scheduledTasks.meta).length
      const afterQueueCount = Object.keys(result.queueWorkers.meta).length

      // GET and POST routes should be preserved
      assert.equal(
        afterGetCount,
        beforeGetCount,
        'GET routes should be preserved'
      )
      assert.equal(
        afterPostCount,
        beforePostCount,
        'POST routes should be preserved'
      )

      // Channels should be preserved (no HTTP method filter applies)
      assert.equal(
        afterChannelCount,
        beforeChannelCount,
        'Channels should be preserved'
      )

      // Other methods/types should be filtered out
      assert.equal(afterPutCount, 0, 'PUT routes should be filtered out')
      assert.equal(afterTaskCount, 0, 'Scheduled tasks should be filtered out')
      assert.equal(afterQueueCount, 0, 'Queue workers should be filtered out')
    })
  })
})
