import { strict as assert } from 'assert'
import { describe, test, beforeEach, afterEach } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { readMcpManifests } from './dev-mcp-manifests.js'

describe('readMcpManifests — what dev mounts', () => {
  let pikkuDir: string
  const warnings: string[] = []
  const warn = (message: string) => {
    warnings.push(message)
  }

  const writeManifest = (name: string, contents: unknown) =>
    writeFileSync(
      join(pikkuDir, 'mcp', name),
      typeof contents === 'string' ? contents : JSON.stringify(contents)
    )

  beforeEach(() => {
    pikkuDir = mkdtempSync(join(tmpdir(), 'pikku-dev-mcp-'))
    mkdirSync(join(pikkuDir, 'mcp'), { recursive: true })
    warnings.length = 0
  })

  afterEach(() => {
    rmSync(pikkuDir, { recursive: true, force: true })
  })

  test('a project with no manifests mounts nothing', () => {
    const { mcpJson, mcpSurfaces } = readMcpManifests(pikkuDir, warn)
    assert.equal(mcpJson, undefined)
    assert.deepEqual(mcpSurfaces, [])
    assert.deepEqual(warnings, [])
  })

  test('an empty manifest is not an endpoint', () => {
    writeManifest('mcp.gen.json', { tools: [], resources: [], prompts: [] })
    assert.equal(readMcpManifests(pikkuDir, warn).mcpJson, undefined)
  })

  test('the default manifest is mounted on its own', () => {
    writeManifest('mcp.gen.json', { tools: [{ name: 'echo' }] })
    const { mcpJson, mcpSurfaces } = readMcpManifests(pikkuDir, warn)
    assert.deepEqual(mcpJson, { tools: [{ name: 'echo' }] })
    assert.deepEqual(mcpSurfaces, [])
  })

  test('every surface is mounted on the path its manifest names', () => {
    // Without this a project that moved its tools onto their own endpoints
    // serves nothing in dev: the default manifest it does read is empty
    // precisely because they moved.
    writeManifest('mcp.gen.json', { tools: [] })
    writeManifest('mcp.weather.gen.json', {
      mcpPath: '/mcp/weather',
      tools: [{ name: 'weather:forecast' }],
    })
    writeManifest('mcp.calendar.gen.json', {
      mcpPath: '/connectors/calendar',
      tools: [{ name: 'calendar:list' }],
    })

    const { mcpJson, mcpSurfaces } = readMcpManifests(pikkuDir, warn)

    assert.equal(mcpJson, undefined)
    assert.deepEqual(
      mcpSurfaces.map((s) => s.mcpPath),
      ['/connectors/calendar', '/mcp/weather']
    )
    assert.deepEqual(
      mcpSurfaces.map((s) => (s.mcpJson.tools as any[])[0].name),
      ['calendar:list', 'weather:forecast']
    )
  })

  test('a surface with no path is skipped rather than guessed at', () => {
    // The path is what the deployed unit is routed on. Mounting at a guess
    // would make dev disagree with production, which is worse than not
    // mounting at all.
    writeManifest('mcp.weather.gen.json', { tools: [{ name: 'forecast' }] })
    assert.deepEqual(readMcpManifests(pikkuDir, warn).mcpSurfaces, [])
  })

  test('a generated file that is not a manifest is left alone', () => {
    writeManifest('pikku-mcp-wirings-meta.gen.json', { anything: true })
    assert.deepEqual(readMcpManifests(pikkuDir, warn).mcpSurfaces, [])
  })

  test('an unparseable manifest warns and serves the rest', () => {
    writeManifest('mcp.broken.gen.json', '{ not json')
    writeManifest('mcp.weather.gen.json', {
      mcpPath: '/mcp/weather',
      tools: [{ name: 'forecast' }],
    })

    const { mcpSurfaces } = readMcpManifests(pikkuDir, warn)

    assert.deepEqual(
      mcpSurfaces.map((s) => s.mcpPath),
      ['/mcp/weather']
    )
    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, /mcp\.broken\.gen\.json/)
  })
})
