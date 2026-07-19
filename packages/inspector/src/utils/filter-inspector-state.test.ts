import { test, describe } from 'node:test'
import { strict as assert } from 'node:assert'
import { filterInspectorState } from './filter-inspector-state.js'
import type { InspectorState, InspectorFilters } from '../types.js'
import type { SerializableInspectorState } from './serialize-inspector-state.js'
import {
  deserializeInspectorState,
  serializeInspectorState,
} from './serialize-inspector-state.js'
import { getInitialInspectorState } from '../inspector.js'
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
    wireServicesTypeImportMap: new Map(),
    userSessionTypeImportMap: new Map(),
    configTypeImportMap: new Map(),
    singletonServicesFactories: new Map(),
    wireServicesFactories: new Map(),
    wireServicesMeta: new Map(),
    configFactories: new Map(),
    filesAndMethods: {},
    filesAndMethodsErrors: new Map(),
    http: {
      metaInputTypes: new Map(),
      meta: {
        get: {
          '/api/users': {
            pikkuFuncId: 'getUsers',
            route: '/api/users',
            method: 'GET',
            tags: ['api', 'public'],
            middleware: [],
            permissions: [],
          },
          '/admin/settings': {
            pikkuFuncId: 'getAdminSettings',
            route: '/admin/settings',
            method: 'GET',
            tags: ['admin'],
            middleware: [{ type: 'wire', name: 'authMiddleware' }],
            permissions: [{ type: 'wire', name: 'adminPermission' }],
          },
        },
        post: {
          '/api/users': {
            pikkuFuncId: 'createUser',
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
    triggers: {
      meta: {},
      files: new Set(),
    },
    channels: {
      meta: {
        'chat-channel': {
          pikkuFuncId: 'handleChatMessage',
          tags: ['realtime', 'public'],
          middleware: [],
          permissions: [],
          sourceFile: '/test/project/src/channels/chat.ts',
        } as any,
        'admin-channel': {
          pikkuFuncId: 'handleAdminMessage',
          tags: ['realtime', 'admin'],
          middleware: [{ type: 'wire', name: 'authMiddleware' }],
          permissions: [],
          sourceFile: '/test/project/src/channels/admin.ts',
        } as any,
      },
      files: new Set([
        '/test/project/src/channels/chat.ts',
        '/test/project/src/channels/admin.ts',
      ]),
    },
    scheduledTasks: {
      meta: {
        'daily-report': {
          pikkuFuncId: 'dailyReport',
          schedule: '0 0 * * *',
          tags: ['cron', 'reports'],
          middleware: [],
          sourceFile: '/test/project/src/tasks/reports.ts',
        } as any,
        'hourly-cleanup': {
          pikkuFuncId: 'hourlyCleanup',
          schedule: '0 * * * *',
          tags: ['cron', 'maintenance'],
          middleware: [],
          sourceFile: '/test/project/src/tasks/cleanup.ts',
        } as any,
      },
      files: new Set([
        '/test/project/src/tasks/reports.ts',
        '/test/project/src/tasks/cleanup.ts',
      ]),
    },
    queueWorkers: {
      meta: {
        'email-worker': {
          pikkuFuncId: 'sendEmailWorker',
          name: 'email-queue',
          tags: ['queue', 'email'],
          middleware: [],
          sourceFile: '/test/project/src/workers/email.ts',
        } as any,
        'notification-worker': {
          pikkuFuncId: 'sendNotificationWorker',
          name: 'notification-queue',
          tags: ['queue', 'notifications'],
          middleware: [],
          sourceFile: '/test/project/src/workers/notification.ts',
        } as any,
      },
      files: new Set([
        '/test/project/src/workers/email.ts',
        '/test/project/src/workers/notification.ts',
      ]),
    },
    workflows: {
      meta: {},
      files: new Map(),
      graphMeta: {},
      graphFiles: new Map(),
      invokedWorkflows: new Set(),
    },
    rpc: {
      internalMeta: {},
      internalFiles: new Map(),
      exposedMeta: {},
      exposedFiles: new Map(),
      invokedFunctions: new Set(),
      invokedFunctionsByFile: new Map(),
    },
    mcpEndpoints: {
      toolsMeta: {
        'search-tool': {
          name: 'search-tool',
          description: 'Search tool',
          pikkuFuncId: 'mcpSearchTool',
          tags: ['mcp', 'search'],
          middleware: [],
          permissions: [],
          sourceFile: '/test/project/src/mcp/search.ts',
        } as any,
        'analyze-tool': {
          name: 'analyze-tool',
          description: 'Analyze tool',
          pikkuFuncId: 'mcpAnalyzeTool',
          tags: ['mcp', 'analytics'],
          middleware: [],
          permissions: [],
          sourceFile: '/test/project/src/mcp/analyze.ts',
        } as any,
      },
      resourcesMeta: {
        'docs-resource': {
          title: 'Docs Resource',
          description: 'Documentation resource',
          uri: 'docs://resource',
          pikkuFuncId: 'mcpDocsResource',
          tags: ['mcp', 'docs'],
          middleware: [],
          permissions: [],
          sourceFile: '/test/project/src/mcp/docs.ts',
        } as any,
      },
      promptsMeta: {
        'help-prompt': {
          name: 'help-prompt',
          description: 'Help prompt',
          pikkuFuncId: 'mcpHelpPrompt',
          tags: ['mcp', 'help'],
          middleware: [],
          permissions: [],
          sourceFile: '/test/project/src/mcp/help.ts',
        } as any,
      },
      files: new Set([
        '/test/project/src/mcp/search.ts',
        '/test/project/src/mcp/analyze.ts',
        '/test/project/src/mcp/docs.ts',
        '/test/project/src/mcp/help.ts',
      ]),
    },
    cli: {
      meta: {
        programs: {
          'my-cli': {
            sourceFile: '/test/project/src/cli/program.ts',
            commands: {
              build: {
                pikkuFuncId: 'cliCommand',
                tags: ['cli', 'build'],
                middleware: [],
                positionals: [],
                options: {},
                sourceFile: '/test/project/src/cli/build.ts',
              } as any,
              test: {
                pikkuFuncId: 'cliTestCommand',
                tags: ['cli', 'test'],
                middleware: [],
                positionals: [],
                options: {},
                sourceFile: '/test/project/src/cli/test.ts',
              } as any,
            },
          } as any,
        },
      },
      files: new Set([
        '/test/project/src/cli/program.ts',
        '/test/project/src/cli/build.ts',
        '/test/project/src/cli/test.ts',
      ]),
    },
    middleware: {
      definitions: {},
      instances: {},
      tagMiddleware: new Map(),
    },
    channelMiddleware: {
      definitions: {},
      instances: {},
      tagMiddleware: new Map(),
    },
    permissions: {
      definitions: {},
      instances: {},
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
  diagnostic: () => {},
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
        wires: [],
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
        wires: ['channel'], // Only channels, not HTTP
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
        wires: ['http'],
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
        wires: ['http'],
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
        wires: ['http'],
        names: ['getUsers'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.equal(Object.keys(result.http.meta.get).length, 1)
      assert.ok(result.http.meta.get['/api/users'])
      assert.equal(result.http.meta.get['/api/users'].pikkuFuncId, 'getUsers')
    })

    test('should filter HTTP routes by name wildcard', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        wires: ['http'],
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
        wires: ['http'],
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
        wires: ['channel'],
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
        wires: ['channel'],
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

    test('should repopulate channel files from surviving metadata', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        wires: ['channel'],
        tags: ['admin'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.deepEqual(Array.from(result.channels.files).sort(), [
        '/test/project/src/channels/admin.ts',
      ])
    })
  })

  describe('Scheduled task filtering', () => {
    test('should filter scheduled tasks by type', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        wires: ['scheduler'],
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
        wires: ['scheduler'],
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

    test('should repopulate scheduled task files from surviving metadata', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        wires: ['scheduler'],
        tags: ['reports'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.deepEqual(Array.from(result.scheduledTasks.files).sort(), [
        '/test/project/src/tasks/reports.ts',
      ])
    })
  })

  describe('Queue worker filtering', () => {
    test('should filter queue workers by type', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        wires: ['queue'],
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
        wires: ['queue'],
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

    test('should repopulate queue worker files from surviving metadata', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        wires: ['queue'],
        tags: ['email'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.deepEqual(Array.from(result.queueWorkers.files).sort(), [
        '/test/project/src/workers/email.ts',
      ])
    })
  })

  describe('MCP endpoint filtering', () => {
    test('should filter MCP tools by type', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        wires: ['mcp'],
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
        wires: ['mcp'],
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

    test('should repopulate MCP files from surviving metadata', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        wires: ['mcp'],
        tags: ['search'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.deepEqual(Array.from(result.mcpEndpoints.files).sort(), [
        '/test/project/src/mcp/search.ts',
      ])
    })
  })

  describe('CLI filtering', () => {
    test('should filter CLI commands by type', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        wires: ['cli'],
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
        wires: ['cli'],
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
        wires: ['cli'],
        tags: ['non-existent'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      // Program should be removed
      assert.equal(Object.keys(result.cli.meta.programs).length, 0)
    })

    test('should repopulate CLI files from surviving metadata', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        wires: ['cli'],
        tags: ['build'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.deepEqual(Array.from(result.cli.files).sort(), [
        '/test/project/src/cli/build.ts',
        '/test/project/src/cli/program.ts',
      ])
    })
  })

  describe('Wire exclusion', () => {
    test('should exclude queue and scheduler wires while keeping http', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        excludeWires: ['queue', 'scheduler'],
      }

      const result = filterInspectorState(state, filters, mockLogger)

      assert.equal(Object.keys(result.queueWorkers.meta).length, 0)
      assert.equal(Object.keys(result.scheduledTasks.meta).length, 0)
      assert.ok(Object.keys(result.http.meta.get).length > 0)
    })
  })

  describe('Combined filtering', () => {
    test('should filter multiple types at once', () => {
      const state = createMockInspectorState()
      const filters: InspectorFilters = {
        wires: ['http', 'channel'],
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
        wires: ['http'],
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
        wires: ['http'],
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
        wires: ['http'],
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
        wires: ['http'],
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
        wires: ['http'],
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
        wires: ['http'],
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
        wires: ['channel'],
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
        wires: ['scheduler'],
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
        wires: ['queue'],
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
        wires: ['mcp'],
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
        wires: ['cli'],
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
        wires: ['http'],
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
        wires: ['http'],
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
        wires: ['http'],
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
        wires: ['http', 'channel'],
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

describe('filterInspectorState exclude filters', () => {
  test('exclude tags removes matching entries after include', () => {
    const state = createMockInspectorState()
    const filters: InspectorFilters = {
      tags: ['api', 'admin'],
      excludeTags: ['admin'],
    }

    const result = filterInspectorState(state, filters, mockLogger)

    assert.ok(result.http.meta.get['/api/users'])
    assert.ok(result.http.meta.post['/api/users'])
    assert.ok(!result.http.meta.get['/admin/settings'])
  })

  test('exclude names wins over broad names include', () => {
    const state = createMockInspectorState()
    const filters: InspectorFilters = {
      names: ['*'],
      excludeNames: ['getAdminSettings'],
    }

    const result = filterInspectorState(state, filters, mockLogger)

    assert.ok(result.http.meta.get['/api/users'])
    assert.ok(result.http.meta.post['/api/users'])
    assert.ok(!result.http.meta.get['/admin/settings'])
  })

  test('exclude target prunes server target while keeping serverless', () => {
    const state = createMockInspectorState()
    ;(state.functions.meta as any).getAdminSettings.deploy = 'server'
    ;(state.functions.meta as any).createUser.deploy = 'serverless'

    const filters: InspectorFilters = {
      target: ['server', 'serverless'],
      excludeTarget: ['server'],
    }

    const result = filterInspectorState(state, filters, mockLogger)

    assert.ok(result.http.meta.post['/api/users'])
    assert.ok(!result.http.meta.get['/admin/settings'])
  })
})

describe('addonServerlessIncompatible scoping', () => {
  // Service names inside addons are scoped to that addon's namespace.
  // 'FfmpegService' in addon A is unrelated to 'FfmpegService' in the app or
  // another addon. The state.addonServerlessIncompatible map must NOT be
  // merged into the global filter — it is intentionally kept separate.

  test('addon serverlessIncompatible does not bleed into app-level function resolution', () => {
    const state = createMockInspectorState()

    // App function uses a service named 'FfmpegService' (e.g. its own service,
    // unrelated to any addon's FfmpegService).
    ;(state.functions.meta as any).getUsers.services = {
      services: ['FfmpegService'],
    }

    // An addon declares FfmpegService as serverless-incompatible for ITS namespace.
    ;(state as any).addonServerlessIncompatible = new Map([
      ['ffmpeg', ['FfmpegService']],
    ])

    // Filter: only keep serverless functions. The filters object does NOT
    // include serverlessIncompatible — that's app-level config only.
    const filters: InspectorFilters = {
      target: ['serverless'],
    }

    const result = filterInspectorState(state, filters, mockLogger)

    // The app's getUsers function must survive — the addon's scoped
    // serverlessIncompatible should have no effect on app-level resolution.
    assert.ok(
      result.http.meta.get['/api/users'],
      'app function using same-named service as addon should not be pruned by addon scoping'
    )
  })

  test('app-level serverlessIncompatible in filters still prunes matching app functions', () => {
    const state = createMockInspectorState()

    ;(state.functions.meta as any).getUsers.services = {
      services: ['HeavyService'],
    }
    ;(state as any).addonServerlessIncompatible = new Map([
      ['some-addon', ['HeavyService']],
    ])

    // The APP explicitly declares HeavyService incompatible via filters.
    const filters: InspectorFilters = {
      target: ['serverless'],
      serverlessIncompatible: ['HeavyService'],
    }

    const result = filterInspectorState(state, filters, mockLogger)

    // App explicitly opted in via filters.serverlessIncompatible → pruned.
    assert.ok(
      !result.http.meta.get['/api/users'],
      'app function should be pruned when app explicitly lists service in filters.serverlessIncompatible'
    )
  })
})

describe('addonServerlessIncompatible serialization roundtrip', () => {
  // Uses getInitialInspectorState to guarantee all Map fields are initialized —
  // the lightweight mock in createMockInspectorState() omits fields like
  // schemaLookup that serializeInspectorState needs.

  test('Map serializes to Array<[string, string[]]> and back', () => {
    const state = getInitialInspectorState('/test')
    state.addonServerlessIncompatible = new Map([
      ['ffmpeg', ['FfmpegService', 'FfprobeService']],
      ['humandesign', ['HumanDesignService']],
    ])

    const serialized = serializeInspectorState(state)
    assert.deepStrictEqual(serialized.addonServerlessIncompatible, [
      ['ffmpeg', ['FfmpegService', 'FfprobeService']],
      ['humandesign', ['HumanDesignService']],
    ])

    const restored = deserializeInspectorState(serialized)
    assert.ok(restored.addonServerlessIncompatible instanceof Map)
    assert.deepStrictEqual(restored.addonServerlessIncompatible.get('ffmpeg'), [
      'FfmpegService',
      'FfprobeService',
    ])
    assert.deepStrictEqual(
      restored.addonServerlessIncompatible.get('humandesign'),
      ['HumanDesignService']
    )
  })

  test('empty Map serializes and restores correctly', () => {
    const state = getInitialInspectorState('/test')
    // addonServerlessIncompatible is already an empty Map from getInitialInspectorState

    const serialized = serializeInspectorState(state)
    assert.deepStrictEqual(serialized.addonServerlessIncompatible, [])

    const restored = deserializeInspectorState(serialized)
    assert.ok(restored.addonServerlessIncompatible instanceof Map)
    assert.strictEqual(restored.addonServerlessIncompatible.size, 0)
  })
})

describe('addon bootstrap tree-shake', () => {
  const withAddon = (
    mutate?: (state: Omit<InspectorState, 'typesLookup'>) => void
  ) => {
    const state = createMockInspectorState()
    state.rpc.wireAddonDeclarations = new Map([
      ['console', { package: '@pikku/addon-console' }],
    ])
    state.rpc.usedAddons = new Set(['console'])
    state.rpc.invokedFunctions = new Set(['console:streamWorkflowRun'])
    mutate?.(state)
    return state
  }

  test('drops an addon nothing kept references', () => {
    const state = withAddon()
    const filtered = filterInspectorState(
      state,
      { names: ['getUsers'] },
      mockLogger
    )
    assert.strictEqual(filtered.rpc.wireAddonDeclarations.size, 0)
    assert.strictEqual(filtered.rpc.usedAddons.size, 0)
  })

  test('keeps an addon when a kept wiring targets one of its functions', () => {
    const state = withAddon((s) => {
      s.http.meta.get['/console/stream'] = {
        pikkuFuncId: 'console:streamWorkflowRun',
        route: '/console/stream',
        method: 'GET',
        tags: [],
        middleware: [],
        permissions: [],
      } as any
    })
    const filtered = filterInspectorState(
      state,
      { names: ['console:streamWorkflowRun'] },
      mockLogger
    )
    assert.strictEqual(filtered.rpc.wireAddonDeclarations.size, 1)
    assert.ok(filtered.rpc.wireAddonDeclarations.has('console'))
  })

  test('keeps an addon when a kept route ref()-targets one of its functions', () => {
    const state = withAddon((s) => {
      s.http.meta.get['/workflow-run/stream'] = {
        pikkuFuncId: 'http:get:/workflow-run/stream',
        refTarget: 'console:streamWorkflowRun',
        route: '/workflow-run/stream',
        method: 'GET',
        tags: [],
        middleware: [],
        permissions: [],
      } as any
      s.functions.meta['http:get:/workflow-run/stream'] = {
        services: { optimized: false, services: [] },
      } as any
    })
    const filtered = filterInspectorState(
      state,
      { names: ['http:get:/workflow-run/stream'] },
      mockLogger
    )
    assert.strictEqual(filtered.rpc.wireAddonDeclarations.size, 1)
    assert.ok(filtered.rpc.wireAddonDeclarations.has('console'))
    assert.ok(
      filtered.serviceAggregation.usedFunctions.has('console:streamWorkflowRun')
    )
  })

  test('drops the addon when the ref()-wired route is filtered out', () => {
    const state = withAddon((s) => {
      s.http.meta.get['/workflow-run/stream'] = {
        pikkuFuncId: 'http:get:/workflow-run/stream',
        refTarget: 'console:streamWorkflowRun',
        route: '/workflow-run/stream',
        method: 'GET',
        tags: [],
        middleware: [],
        permissions: [],
      } as any
      s.functions.meta['http:get:/workflow-run/stream'] = {
        services: { optimized: false, services: [] },
      } as any
    })
    const filtered = filterInspectorState(
      state,
      { names: ['getUsers'] },
      mockLogger
    )
    assert.strictEqual(filtered.rpc.wireAddonDeclarations.size, 0)
    assert.ok(
      !filtered.serviceAggregation.usedFunctions.has(
        'console:streamWorkflowRun'
      )
    )
  })

  test('keeps an addon when a kept MCP tool targets one of its functions', () => {
    const state = withAddon((s) => {
      s.mcpEndpoints.toolsMeta['console:getSchema'] = {
        name: 'console:getSchema',
        description: 'addon tool',
        pikkuFuncId: 'console:getSchema',
        tags: [],
        middleware: [],
        permissions: [],
      } as any
    })
    const filtered = filterInspectorState(
      state,
      { names: ['console:getSchema'] },
      mockLogger
    )
    assert.strictEqual(filtered.rpc.wireAddonDeclarations.size, 1)
  })

  test('keeps an addon when a kept agent lists one of its functions as a tool', () => {
    const state = withAddon((s) => {
      s.agents = s.agents ?? ({ agentsMeta: {} } as any)
      s.agents.agentsMeta['support-agent'] = {
        name: 'support-agent',
        pikkuFuncId: 'supportAgent',
        tools: ['console:getSchema'],
        tags: [],
      } as any
    })
    const filtered = filterInspectorState(
      state,
      { names: ['support-agent'] },
      mockLogger
    )
    assert.strictEqual(filtered.rpc.wireAddonDeclarations.size, 1)
  })

  test('keeps an addon when a kept function body-invokes it', () => {
    const state = withAddon((s) => {
      s.rpc.invokedFunctionsByFile = new Map([
        ['/test/project/src/api/users.ts', new Set(['console:getSchema'])],
      ])
    })
    const filtered = filterInspectorState(
      state,
      { names: ['getUsers'] },
      mockLogger
    )
    assert.strictEqual(filtered.rpc.wireAddonDeclarations.size, 1)
  })

  test('a kept-file body invoke joins the filtered usedFunctions', () => {
    const state = withAddon((s) => {
      s.rpc.invokedFunctionsByFile = new Map([
        ['/test/project/src/api/users.ts', new Set(['console:getSchema'])],
      ])
    })
    const filtered = filterInspectorState(
      state,
      { names: ['getUsers'] },
      mockLogger
    )
    assert.ok(
      filtered.serviceAggregation.usedFunctions.has('console:getSchema')
    )
  })

  test('drops an addon body-invoked only from filtered-out files', () => {
    const state = withAddon((s) => {
      s.rpc.invokedFunctionsByFile = new Map([
        ['/test/project/src/admin/settings.ts', new Set(['console:getSchema'])],
      ])
    })
    const filtered = filterInspectorState(
      state,
      { names: ['getUsers'] },
      mockLogger
    )
    assert.strictEqual(filtered.rpc.wireAddonDeclarations.size, 0)
  })

  test('unfiltered state keeps all addons', () => {
    const state = withAddon()
    const filtered = filterInspectorState(state, {}, mockLogger)
    assert.strictEqual(filtered.rpc.wireAddonDeclarations.size, 1)
  })
})

describe('invokedFunctionsByFile serialization', () => {
  test('round-trips through serialize/deserialize', () => {
    const state = getInitialInspectorState('/test/project')
    state.rpc.invokedFunctionsByFile = new Map([
      ['/test/project/src/api/users.ts', new Set(['console:getSchema'])],
      [
        '/test/project/src/api/tasks.ts',
        new Set(['listTasks', 'console:runAgent']),
      ],
    ])
    const restored = deserializeInspectorState(
      JSON.parse(JSON.stringify(serializeInspectorState(state as any)))
    )
    assert.ok(restored.rpc.invokedFunctionsByFile instanceof Map)
    assert.strictEqual(restored.rpc.invokedFunctionsByFile.size, 2)
    assert.deepStrictEqual(
      [
        ...restored.rpc.invokedFunctionsByFile.get(
          '/test/project/src/api/tasks.ts'
        )!,
      ].sort(),
      ['console:runAgent', 'listTasks']
    )
  })

  test('deserializing legacy state without the field yields an empty Map', () => {
    const serialized = JSON.parse(
      JSON.stringify(
        serializeInspectorState(
          getInitialInspectorState('/test/project') as any
        )
      )
    )
    delete serialized.rpc.invokedFunctionsByFile
    const restored = deserializeInspectorState(serialized)
    assert.ok(restored.rpc.invokedFunctionsByFile instanceof Map)
    assert.strictEqual(restored.rpc.invokedFunctionsByFile.size, 0)
  })
})
