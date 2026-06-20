import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strict as assert } from 'node:assert'
import { describe, test } from 'node:test'
import { pikkuCommandHTTP } from './http/pikku-command-http-routes.js'
import { pikkuCommandChannels } from './channels/pikku-command-channels.js'
import { pikkuCLI } from './cli/pikku-command-cli.js'

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const baseConfig = (outDir: string) => ({
  packageMappings: {},
  schema: { supportsImportAttributes: true },
  httpWiringsFile: join(outDir, 'http', 'pikku-http-wirings.gen.ts'),
  httpWiringMetaFile: join(outDir, 'http', 'pikku-http-wirings-meta.gen.ts'),
  httpWiringMetaJsonFile: join(
    outDir,
    'http',
    'pikku-http-wirings-meta.gen.json'
  ),
  httpContractsMetaJsonFile: join(
    outDir,
    'http',
    'pikku-http-contracts-meta.gen.json'
  ),
  httpContractsMetaFile: join(
    outDir,
    'http',
    'pikku-http-contracts-meta.gen.ts'
  ),
  channelsWiringFile: join(outDir, 'channel', 'pikku-channels.gen.ts'),
  channelsWiringMetaFile: join(outDir, 'channel', 'pikku-channels-meta.gen.ts'),
  channelsWiringMetaJsonFile: join(
    outDir,
    'channel',
    'pikku-channels-meta.gen.json'
  ),
  channelContractsMetaJsonFile: join(
    outDir,
    'channel',
    'pikku-channel-contracts-meta.gen.json'
  ),
  channelContractsMetaFile: join(
    outDir,
    'channel',
    'pikku-channel-contracts-meta.gen.ts'
  ),
  cliWiringsFile: join(outDir, 'cli', 'pikku-cli-wirings.gen.ts'),
  cliWiringMetaFile: join(outDir, 'cli', 'pikku-cli-wirings-meta.gen.ts'),
  cliWiringMetaJsonFile: join(outDir, 'cli', 'pikku-cli-wirings-meta.gen.json'),
  cliContractsMetaJsonFile: join(
    outDir,
    'cli',
    'pikku-cli-contracts-meta.gen.json'
  ),
  cliContractsMetaFile: join(outDir, 'cli', 'pikku-cli-contracts-meta.gen.ts'),
})

const emptyExportedContracts = () => ({ http: {}, channel: {}, cli: {} })

describe('addon contracts wrapper emission', () => {
  test('http producer writes a .gen.ts wrapper importing the contracts json', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'pikku-contracts-http-'))
    const config = baseConfig(outDir)
    const context = {
      logger,
      config,
      getInspectorState: async () => ({
        http: { files: new Set(), meta: {} },
        exportedContracts: {
          ...emptyExportedContracts(),
          http: {
            helloRoutes: {
              basePath: '/ext',
              routes: {
                hello: {
                  method: 'get',
                  route: '/hello',
                  func: { pikkuFuncId: 'hello' },
                },
              },
            },
          },
        },
      }),
    }

    await (pikkuCommandHTTP as any).func(context, undefined, {})

    const wrapper = await readFile(config.httpContractsMetaFile, 'utf8')
    assert.match(
      wrapper,
      /import contractsMeta from '\.\/pikku-http-contracts-meta\.gen\.json' with \{ type: 'json' \}/
    )
    assert.match(wrapper, /export default contractsMeta/)
    const json = JSON.parse(
      await readFile(config.httpContractsMetaJsonFile, 'utf8')
    )
    assert.equal(json.helloRoutes.basePath, '/ext')
  })

  test('channel producer writes a .gen.ts wrapper importing the contracts json', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'pikku-contracts-channel-'))
    const config = baseConfig(outDir)
    const context = {
      logger,
      config,
      getInspectorState: async () => ({
        channels: { files: new Set(), meta: {} },
        exportedContracts: {
          ...emptyExportedContracts(),
          channel: {
            helloChannel: { hello: { pikkuFuncId: 'hello' } },
          },
        },
      }),
    }

    await (pikkuCommandChannels as any).func(context, undefined, {})

    const wrapper = await readFile(config.channelContractsMetaFile, 'utf8')
    assert.match(
      wrapper,
      /import contractsMeta from '\.\/pikku-channel-contracts-meta\.gen\.json' with \{ type: 'json' \}/
    )
    assert.match(wrapper, /export default contractsMeta/)
  })

  test('cli producer writes a .gen.ts wrapper importing the contracts json', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'pikku-contracts-cli-'))
    const config = baseConfig(outDir)
    const context = {
      logger,
      config,
      getInspectorState: async () => ({
        cli: { files: new Set(), meta: {} },
        exportedContracts: {
          ...emptyExportedContracts(),
          cli: {
            helloCommands: { hello: { pikkuFuncId: 'hello', options: {} } },
          },
        },
      }),
    }

    await (pikkuCLI as any).func(context, undefined, {})

    const wrapper = await readFile(config.cliContractsMetaFile, 'utf8')
    assert.match(
      wrapper,
      /import contractsMeta from '\.\/pikku-cli-contracts-meta\.gen\.json' with \{ type: 'json' \}/
    )
    assert.match(wrapper, /export default contractsMeta/)
  })
})
