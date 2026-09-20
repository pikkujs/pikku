import { strict as assert } from 'assert'
import { describe, test, before, after } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadAddonFunctionsMeta } from './load-addon-functions-meta.js'
import type { InspectorState, InspectorLogger } from '../types.js'

const ADDON = '@addon/slack'

const writeAddonFixture = (rootDir: string) => {
  writeFileSync(
    join(rootDir, 'package.json'),
    JSON.stringify({ name: 'consumer' })
  )
  const addonDir = join(rootDir, 'node_modules', ADDON)
  const pikku = join(addonDir, '.pikku')
  mkdirSync(join(pikku, 'function'), { recursive: true })
  mkdirSync(join(pikku, 'secrets'), { recursive: true })
  mkdirSync(join(pikku, 'variables'), { recursive: true })
  mkdirSync(join(pikku, 'credentials'), { recursive: true })
  writeFileSync(join(addonDir, 'package.json'), JSON.stringify({ name: ADDON }))
  writeFileSync(
    join(pikku, 'function', 'pikku-functions-meta.gen.json'),
    JSON.stringify({})
  )
  // Real addon secrets/variables have a logical name that DIFFERS from the id
  // the addon reads by (secretId/variableId) — overrides key on the id.
  writeFileSync(
    join(pikku, 'secrets', 'pikku-secrets-meta.gen.json'),
    JSON.stringify({ slack: { name: 'slack', secretId: 'SLACK_TOKEN' } })
  )
  writeFileSync(
    join(pikku, 'variables', 'pikku-variables-meta.gen.json'),
    JSON.stringify({ region: { name: 'region', variableId: 'REGION' } })
  )
  writeFileSync(
    join(pikku, 'credentials', 'pikku-credentials-meta.gen.json'),
    JSON.stringify({
      slackOAuth: { name: 'slackOAuth', type: 'singleton' },
    })
  )
}

const makeState = (
  rootDir: string,
  wireAddonDeclarations: Map<string, any>
): InspectorState =>
  ({
    rootDir,
    rpc: { wireAddonDeclarations },
    addonFunctions: {},
    secrets: { definitions: [] },
    variables: { definitions: [] },
    credentials: { definitions: [] },
    mcpEndpoints: { toolsMeta: {}, surfaces: {} },
    addonServerlessIncompatible: new Map(),
    addonRequiredParentServices: [],
    exportedContracts: { addonHttp: {}, addonCli: {}, addonChannel: {} },
  }) as unknown as InspectorState

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  critical: () => {},
  diagnostic: () => {},
} as unknown as InspectorLogger

describe('loadAddonFunctionsMeta — per-instance secret/variable overrides', () => {
  let rootDir: string

  before(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'pikku-addon-meta-'))
    writeAddonFixture(rootDir)
  })

  after(() => {
    rmSync(rootDir, { recursive: true, force: true })
  })

  test('registers the override target names, one per instance, not the shared logical name', async () => {
    const state = makeState(
      rootDir,
      new Map<string, any>([
        [
          'slack-marketing',
          {
            package: ADDON,
            // Overrides key on the secretId/variableId, not the logical name.
            secretOverrides: { SLACK_TOKEN: 'SLACK_MARKETING_TOKEN' },
            variableOverrides: { REGION: 'MARKETING_REGION' },
            credentialOverrides: { slackOAuth: 'slack_marketing_oauth' },
          },
        ],
        [
          'slack-support',
          {
            package: ADDON,
            secretOverrides: { SLACK_TOKEN: 'SLACK_SUPPORT_TOKEN' },
            credentialOverrides: { slackOAuth: 'slack_support_oauth' },
          },
        ],
      ])
    )

    await loadAddonFunctionsMeta(logger, state)

    const secretIds = state.secrets.definitions
      .map((d: any) => d.secretId)
      .sort()
    assert.deepEqual(secretIds, [
      'SLACK_MARKETING_TOKEN',
      'SLACK_SUPPORT_TOKEN',
    ])

    // slack-marketing overrides region; slack-support has no override, so it
    // falls back to the addon's default variableId.
    const variableIds = state.variables.definitions
      .map((d: any) => d.variableId)
      .sort()
    assert.deepEqual(variableIds, ['MARKETING_REGION', 'REGION'])

    // Each instance's credentialOverride surfaces a distinct credential name
    // (which doubles as the better-auth providerId) — no shared account pool.
    const credentialNames = state.credentials.definitions
      .map((d: any) => d.name)
      .sort()
    assert.deepEqual(credentialNames, [
      'slack_marketing_oauth',
      'slack_support_oauth',
    ])
  })

  test('falls back to the addon logical name when no override is provided', async () => {
    const state = makeState(
      rootDir,
      new Map<string, any>([['slack-plain', { package: ADDON }]])
    )

    await loadAddonFunctionsMeta(logger, state)

    assert.deepEqual(
      state.secrets.definitions.map((d: any) => d.secretId),
      ['SLACK_TOKEN']
    )
    assert.deepEqual(
      state.variables.definitions.map((d: any) => d.variableId),
      ['REGION']
    )
    assert.deepEqual(
      state.credentials.definitions.map((d: any) => d.name),
      ['slackOAuth']
    )
  })
})

describe('loadAddonFunctionsMeta — which of an addon’s functions reach MCP', () => {
  let rootDir: string

  const FUNCTIONS = {
    postMessage: { mcp: true, description: 'Post a message' },
    listChannels: { mcp: true },
    rotateToken: {},
  }

  before(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'pikku-addon-mcp-'))
    writeAddonFixture(rootDir)
    writeFileSync(
      join(
        rootDir,
        'node_modules',
        ADDON,
        '.pikku',
        'function',
        'pikku-functions-meta.gen.json'
      ),
      JSON.stringify(FUNCTIONS)
    )
  })

  after(() => {
    rmSync(rootDir, { recursive: true, force: true })
  })

  const toolNames = async (
    mcp: boolean | string[] | undefined,
    log = logger
  ) => {
    const state = makeState(
      rootDir,
      new Map<string, any>([['slack', { package: ADDON, mcp }]])
    )
    await loadAddonFunctionsMeta(log, state)
    return Object.keys(state.mcpEndpoints.toolsMeta).sort()
  }

  test('mcp: true offers every function the addon declared as a tool', async () => {
    assert.deepEqual(await toolNames(true), [
      'slack:listChannels',
      'slack:postMessage',
    ])
  })

  test('a list names the tools, including one the addon never declared', async () => {
    // The addon says which of its functions are tool-shaped; the app installing
    // it says which of them this deployment offers a model.
    assert.deepEqual(await toolNames(['postMessage', 'rotateToken']), [
      'slack:postMessage',
      'slack:rotateToken',
    ])
  })

  test('an empty list offers nothing, unlike an absent one', async () => {
    assert.deepEqual(await toolNames([]), [])
    assert.deepEqual(await toolNames(undefined), [])
  })

  const surfaceState = async (mcpEndpoint: boolean | string | undefined) => {
    const state = makeState(
      rootDir,
      new Map<string, any>([
        ['slack', { package: ADDON, mcp: true, mcpEndpoint }],
      ])
    )
    await loadAddonFunctionsMeta(logger, state)
    return state
  }

  test('without mcpEndpoint the tools stay on the default endpoint', async () => {
    const state = await surfaceState(undefined)
    assert.deepEqual(state.mcpEndpoints.surfaces, {})
    for (const tool of Object.values(state.mcpEndpoints.toolsMeta)) {
      assert.equal(tool.surface, undefined)
    }
  })

  test('mcpEndpoint: true gives the instance /mcp/<name> to itself', async () => {
    const state = await surfaceState(true)
    assert.deepEqual(state.mcpEndpoints.surfaces, { slack: '/mcp/slack' })
    assert.deepEqual(
      Object.values(state.mcpEndpoints.toolsMeta).map((t) => t.surface),
      ['slack', 'slack']
    )
  })

  test('a string mcpEndpoint is the path, used as given', async () => {
    const state = await surfaceState('/connectors/slack')
    assert.deepEqual(state.mcpEndpoints.surfaces, {
      slack: '/connectors/slack',
    })
  })

  test('a name the addon does not publish fails the build', async () => {
    const criticals: string[] = []
    const failing = {
      ...logger,
      critical: (code: string, message: string) => {
        criticals.push(`${code}: ${message}`)
      },
    } as unknown as InspectorLogger

    assert.deepEqual(await toolNames(['postMessage', 'postMesage'], failing), [
      'slack:postMessage',
    ])
    assert.equal(criticals.length, 1)
    assert.match(criticals[0]!, /PKU341/)
    assert.match(criticals[0]!, /postMesage/)
  })
})
