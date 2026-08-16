import { strict as assert } from 'node:assert'
import { describe, test } from 'node:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { InspectorLogger } from '../types.js'

const logger: InspectorLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  critical: () => {},
  hasCriticalErrors: () => false,
}

describe('addon contract metadata', () => {
  test('collects exported local define contracts', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-exported-contracts-'))
    const file = join(rootDir, 'contracts.ts')

    await writeFile(
      join(rootDir, 'package.json'),
      JSON.stringify({ name: 'test-app', type: 'module' }, null, 2)
    )

    await writeFile(
      file,
      [
        "import { pikkuSessionlessFunc } from '@pikku/core'",
        "import { defineHTTPRoutes } from '@pikku/core/http'",
        "import { defineChannelRoutes } from '@pikku/core/channel'",
        "import { defineCLICommands } from '@pikku/core/cli'",
        'export const listTodos = pikkuSessionlessFunc({ func: async () => ({ ok: true }) })',
        'export const subscribeTodo = pikkuSessionlessFunc({ func: async () => ({ ok: true }) })',
        'export const runSync = pikkuSessionlessFunc({ func: async () => ({ ok: true }) })',
        "export const httpRoutes = defineHTTPRoutes({ basePath: '/todos', routes: { list: { method: 'get', route: '/', func: listTodos } } })",
        'export const channelRoutes = defineChannelRoutes({ subscribe: { func: subscribeTodo } })',
        'export const cliCommands = defineCLICommands({ sync: { func: runSync, options: {} } })',
      ].join('\n')
    )

    try {
      const state = await inspect(logger, [file], { rootDir })
      assert.equal(
        state.exportedContracts.http.httpRoutes?.routes.list?.func.pikkuFuncId,
        'listTodos'
      )
      assert.equal(
        state.exportedContracts.channel.channelRoutes?.subscribe?.pikkuFuncId,
        'subscribeTodo'
      )
      assert.equal(
        state.exportedContracts.cli.cliCommands?.sync?.pikkuFuncId,
        'runSync'
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('expands addon contracts referenced via refHTTP/refChannel/refCLI', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-addon-refs-app-'))
    const nodeModulesDir = join(rootDir, 'node_modules', '@test', 'addon')
    const appFile = join(rootDir, 'app.ts')

    await mkdir(join(nodeModulesDir, '.pikku', 'function'), { recursive: true })
    await mkdir(join(nodeModulesDir, '.pikku', 'http'), { recursive: true })
    await mkdir(join(nodeModulesDir, '.pikku', 'cli'), { recursive: true })
    await mkdir(join(nodeModulesDir, '.pikku', 'channel'), { recursive: true })

    await writeFile(
      join(rootDir, 'package.json'),
      JSON.stringify({ name: 'test-app', type: 'module' }, null, 2)
    )
    await writeFile(
      join(nodeModulesDir, 'package.json'),
      JSON.stringify({ name: '@test/addon', type: 'module' }, null, 2)
    )
    await writeFile(
      join(
        nodeModulesDir,
        '.pikku',
        'function',
        'pikku-functions-meta.gen.json'
      ),
      JSON.stringify(
        {
          listTodos: {
            pikkuFuncId: 'listTodos',
            inputSchemaName: null,
            outputSchemaName: null,
            sessionless: true,
          },
          runSync: {
            pikkuFuncId: 'runSync',
            inputSchemaName: null,
            outputSchemaName: null,
            sessionless: true,
          },
          subscribeTodo: {
            pikkuFuncId: 'subscribeTodo',
            inputSchemaName: null,
            outputSchemaName: null,
            sessionless: true,
          },
        },
        null,
        2
      )
    )
    await writeFile(
      join(
        nodeModulesDir,
        '.pikku',
        'http',
        'pikku-http-contracts-meta.gen.json'
      ),
      JSON.stringify(
        {
          httpRoutes: {
            basePath: '/addon',
            routes: {
              list: {
                method: 'get',
                route: '/todos',
                func: { pikkuFuncId: 'listTodos' },
              },
            },
          },
        },
        null,
        2
      )
    )
    await writeFile(
      join(
        nodeModulesDir,
        '.pikku',
        'cli',
        'pikku-cli-contracts-meta.gen.json'
      ),
      JSON.stringify(
        {
          cliCommands: {
            sync: {
              pikkuFuncId: 'runSync',
              positionals: [],
              options: {},
            },
          },
        },
        null,
        2
      )
    )
    await writeFile(
      join(
        nodeModulesDir,
        '.pikku',
        'channel',
        'pikku-channel-contracts-meta.gen.json'
      ),
      JSON.stringify(
        {
          channelRoutes: {
            subscribe: {
              pikkuFuncId: 'subscribeTodo',
            },
          },
        },
        null,
        2
      )
    )

    await writeFile(
      appFile,
      [
        "import { wireAddon } from '@pikku/core/rpc'",
        "import { wireHTTPRoutes } from '@pikku/core/http'",
        "import { wireChannel } from '@pikku/core/channel'",
        "import { wireCLI } from '@pikku/core/cli'",
        'declare const refHTTP: (name: string) => any',
        'declare const refChannel: (name: string) => any',
        'declare const refCLI: (name: string) => any',
        "wireAddon({ name: 'addon', package: '@test/addon' })",
        "wireHTTPRoutes({ basePath: '/api', routes: { keep: refHTTP('addon:httpRoutes'), moved: refHTTP('addon:httpRoutes', { basePath: '/ext' }) } })",
        "wireChannel({ name: 'live', route: '/live', auth: false, onMessageWiring: { action: refChannel('addon:channelRoutes') } })",
        "wireCLI({ program: 'app', commands: { ...refCLI('addon:cliCommands') } })",
      ].join('\n')
    )

    try {
      const state = await inspect(logger, [appFile], { rootDir })

      // Default: the addon contract's own basePath ('/addon') is preserved —
      // the cosmetic slot key ('keep') does not affect the path.
      const httpEntry = state.http.meta.get['/api/addon/todos']
      assert.equal(httpEntry?.packageName, '@test/addon')
      assert.equal(httpEntry?.pikkuFuncId, 'addon:listTodos')

      // Override: the second-arg basePath ('/ext') replaces the addon's own.
      const overridden = state.http.meta.get['/api/ext/todos']
      assert.equal(overridden?.packageName, '@test/addon')
      assert.equal(overridden?.pikkuFuncId, 'addon:listTodos')

      const channelEntry =
        state.channels.meta.live?.messageWirings.action?.subscribe
      assert.equal(channelEntry?.packageName, '@test/addon')
      assert.equal(channelEntry?.pikkuFuncId, 'addon:subscribeTodo')

      const cliEntry = state.cli.meta.programs.app?.commands.sync
      assert.equal(cliEntry?.packageName, '@test/addon')
      assert.equal(cliEntry?.pikkuFuncId, 'addon:runSync')
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
