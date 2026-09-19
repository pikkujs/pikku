import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { getEntryContext } from './deploy-apply.js'
import type { InspectorState } from '@pikku/inspector'

// Enough of the inspector for the entry to be generatable. Everything the MCP
// branch reads comes off disk, so the rest can be the minimum that satisfies
// the "createConfig and createSingletonServices must be defined" guard.
const inspectorState = {
  filesAndMethods: {
    pikkuConfigFactory: { file: '/project/src/config.ts', variable: 'config' },
    singletonServicesFactory: {
      file: '/project/src/services.ts',
      variable: 'createSingletonServices',
    },
  },
} as unknown as InspectorState

const unitNamed = (name: string, role: string) =>
  ({ name, role }) as unknown as Parameters<typeof getEntryContext>[2]

/**
 * Lays out a unit directory with one MCP manifest at `manifestName`, and
 * returns the context the entry would be generated from.
 */
const contextWithManifest = (
  manifestName: string,
  manifest: Record<string, unknown>,
  unit: Parameters<typeof getEntryContext>[2]
) => {
  const root = mkdtempSync(join(tmpdir(), 'pikku-deploy-entry-'))
  try {
    const pikkuDir = join(root, '.pikku')
    mkdirSync(join(pikkuDir, 'mcp'), { recursive: true })
    writeFileSync(join(pikkuDir, 'mcp', manifestName), JSON.stringify(manifest))
    return getEntryContext(root, pikkuDir, unit, inspectorState)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const oneTool = { tools: [{ name: 'doThing' }] }

describe('the MCP manifest a generated entry mounts', () => {
  // An `mcp` unit serves exactly the one surface it was emitted for, and its
  // name carries that surface's slug — which is also the manifest's filename.
  // Reading the default manifest here would mount another surface's tools.
  test('a slugged unit imports its own manifest', () => {
    const context = contextWithManifest(
      'mcp.weather.gen.json',
      oneTool,
      unitNamed('mcp-weather', 'mcp')
    )
    assert.match(context.mcpImport, /mcp\.weather\.gen\.json/)
    assert.equal(context.mcpServerOption, 'mcpJson, ')
  })

  test('a slugged unit ignores the default manifest', () => {
    const context = contextWithManifest(
      'mcp.gen.json',
      oneTool,
      unitNamed('mcp-weather', 'mcp')
    )
    assert.equal(context.mcpImport, '')
    assert.equal(context.mcpServerOption, '')
  })

  test('mcp-server keeps the default manifest', () => {
    const context = contextWithManifest(
      'mcp.gen.json',
      oneTool,
      unitNamed('mcp-server', 'mcp')
    )
    assert.match(context.mcpImport, /mcp\.gen\.json/)
    assert.doesNotMatch(context.mcpImport, /mcp\.[a-z]+\.gen\.json/)
  })

  // A monolith serves the default surface the way it always did.
  test('a non-mcp unit keeps the default manifest', () => {
    const context = contextWithManifest(
      'mcp.gen.json',
      oneTool,
      unitNamed('monolith', 'function')
    )
    assert.match(context.mcpImport, /mcp\.gen\.json/)
  })

  // The mount point travels with the manifest, so a surface wired somewhere
  // other than /mcp is served there rather than silently at the default.
  test('a custom mcpPath reaches the server options', () => {
    const context = contextWithManifest(
      'mcp.weather.gen.json',
      { ...oneTool, mcpPath: '/connectors/weather' },
      unitNamed('mcp-weather', 'mcp')
    )
    assert.equal(
      context.mcpServerOption,
      'mcpJson, mcpPath: "/connectors/weather", '
    )
  })

  // The default is what the server already assumes, so passing it would be
  // noise in every generated entry that never moved.
  test('the default mcpPath is left out', () => {
    const context = contextWithManifest(
      'mcp.weather.gen.json',
      { ...oneTool, mcpPath: '/mcp' },
      unitNamed('mcp-weather', 'mcp')
    )
    assert.equal(context.mcpServerOption, 'mcpJson, ')
  })

  test('an empty manifest mounts nothing', () => {
    const context = contextWithManifest(
      'mcp.weather.gen.json',
      { tools: [], resources: [], prompts: [] },
      unitNamed('mcp-weather', 'mcp')
    )
    assert.equal(context.mcpImport, '')
    assert.equal(context.mcpServerOption, '')
  })
})
