import { strict as assert } from 'node:assert'
import { mkdtemp, readFile } from 'node:fs/promises'
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'

import { pikkuMCP } from './pikku-command-mcp.js'

const tempDirs: string[] = []

after(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const project = async () => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-mcp-'))
  tempDirs.push(root)
  return root
}

const logger = {
  error() {},
  warn() {},
  info() {},
  debug() {},
} as never

const config = (root: string) =>
  ({
    rootDir: root,
    outDir: join(root, '.pikku'),
    packageMappings: {},
    mcpWiringsFile: join(root, '.pikku', 'mcp-wirings.gen.ts'),
    mcpWiringsMetaFile: join(root, '.pikku', 'mcp-meta.gen.ts'),
    mcpWiringsMetaJsonFile: join(root, '.pikku', 'mcp-meta.gen.json'),
    schemaDirectory: join(root, '.pikku', 'schemas'),
    schema: { supportsImportAttributes: false },
  }) as never

/**
 * An addon contributes its tools through `wireAddon({ mcp })`, so no source
 * file in the app calls `wireMCPTool` and `files` stays empty. The meta is
 * still there, and is the only thing carrying `pikkuFuncId` — which is what
 * dispatch resolves a call through.
 */
const addonOnlyState = () => async () =>
  ({
    mcpEndpoints: {
      files: new Set<string>(),
      toolsMeta: {
        'bb2:getMe': {
          name: 'bb2:getMe',
          title: 'getMe',
          description: 'getMe',
          pikkuFuncId: 'bb2:getMeFunc',
          inputSchema: null,
          outputSchema: 'MCPToolResponse',
        },
      },
      resourcesMeta: {},
      promptsMeta: {},
    },
    functions: { meta: {}, typesMap: { customTypes: new Map() } },
  }) as never

const run = (root: string, getInspectorState: unknown) =>
  (pikkuMCP as unknown as { func: Function }).func(
    { logger, config: config(root), getInspectorState },
    undefined,
    {}
  )

describe('pikkuMCP', () => {
  test('writes tool meta for an app whose only MCP content comes from an addon', async () => {
    const root = await project()

    assert.equal(await run(root, addonOnlyState()), true)

    const metaJson = join(root, '.pikku', 'mcp-meta.gen.json')
    assert.ok(existsSync(metaJson), 'no MCP meta was generated')

    const meta = JSON.parse(await readFile(metaJson, 'utf-8'))
    assert.equal(meta.toolsMeta['bb2:getMe'].pikkuFuncId, 'bb2:getMeFunc')
  })

  test('generates nothing when there is no MCP content at all', async () => {
    const root = await project()

    const empty = async () =>
      ({
        mcpEndpoints: {
          files: new Set<string>(),
          toolsMeta: {},
          resourcesMeta: {},
          promptsMeta: {},
        },
        functions: { meta: {}, typesMap: { customTypes: new Map() } },
      }) as never

    assert.equal(await run(root, empty), undefined)
    assert.equal(existsSync(join(root, '.pikku', 'mcp-meta.gen.json')), false)
  })
})
