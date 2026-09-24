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

describe('loadAddonFunctionsMeta — wireAddon expose lists', () => {
  let rootDir: string

  before(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'pikku-addon-expose-'))
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
      JSON.stringify({ getOrder: { expose: true }, voidInvoice: {} })
    )
  })

  after(() => {
    rmSync(rootDir, { recursive: true, force: true })
  })

  const criticalsFor = async (expose: boolean | string[] | undefined) => {
    const criticals: string[] = []
    const failing = {
      ...logger,
      critical: (code: string, message: string) => {
        criticals.push(`${code}: ${message}`)
      },
    } as unknown as InspectorLogger
    await loadAddonFunctionsMeta(
      failing,
      makeState(
        rootDir,
        new Map<string, any>([['shop', { package: ADDON, expose }]])
      )
    )
    return criticals
  }

  test('a name the addon does not publish fails the build', async () => {
    const criticals = await criticalsFor(['getOrder', 'getOrdr', 'toString'])
    assert.equal(criticals.length, 2)
    assert.match(criticals[1]!, /toString/)
    assert.match(criticals[0]!, /PKU343/)
    assert.match(criticals[0]!, /getOrdr/)
  })

  test('published names, including undeclared ones, and booleans pass', async () => {
    assert.deepEqual(await criticalsFor(['getOrder', 'voidInvoice']), [])
    assert.deepEqual(await criticalsFor(false), [])
    assert.deepEqual(await criticalsFor(true), [])
  })
})

describe('loadAddonFunctionsMeta — where an addon resolves from', () => {
  let rootDir: string
  let functionsDir: string

  before(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'pikku-addon-resolve-'))
    writeFileSync(
      join(rootDir, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['packages/*'] })
    )
    functionsDir = join(rootDir, 'packages', 'functions')
    mkdirSync(join(functionsDir, 'src'), { recursive: true })
    writeFileSync(
      join(functionsDir, 'package.json'),
      JSON.stringify({ name: '@project/functions' })
    )
  })

  after(() => {
    rmSync(rootDir, { recursive: true, force: true })
  })

  const warnings: string[] = []
  const recording = {
    ...logger,
    warn: (message: string) => warnings.push(message),
  } as unknown as InspectorLogger

  const load = async (pkg: string) => {
    warnings.length = 0
    const state = makeState(
      rootDir,
      new Map<string, any>([
        [
          'crm',
          { package: pkg, file: join(functionsDir, 'src', 'crm.addon.ts') },
        ],
      ])
    )
    await loadAddonFunctionsMeta(recording, state)
    return state
  }

  test('an addon installed only in the package that calls wireAddon still loads', async () => {
    const addonDir = join(functionsDir, 'node_modules', '@addon', 'crm')
    mkdirSync(join(addonDir, '.pikku', 'function'), { recursive: true })
    writeFileSync(
      join(addonDir, 'package.json'),
      JSON.stringify({ name: '@addon/crm' })
    )
    writeFileSync(
      join(addonDir, '.pikku', 'function', 'pikku-functions-meta.gen.json'),
      JSON.stringify({ listContacts: {} })
    )

    const state = await load('@addon/crm')

    assert.deepEqual(Object.keys(state.addonFunctions.crm), ['listContacts'])
    assert.deepEqual(warnings, [])
  })

  test('the declaring package’s copy wins over the root’s', async () => {
    for (const [dir, fn] of [
      [rootDir, 'rootVersion'],
      [functionsDir, 'localVersion'],
    ]) {
      const addonDir = join(dir, 'node_modules', '@addon', 'both')
      mkdirSync(join(addonDir, '.pikku', 'function'), { recursive: true })
      writeFileSync(
        join(addonDir, 'package.json'),
        JSON.stringify({ name: '@addon/both' })
      )
      writeFileSync(
        join(addonDir, '.pikku', 'function', 'pikku-functions-meta.gen.json'),
        JSON.stringify({ [fn]: {} })
      )
    }

    const state = await load('@addon/both')

    assert.deepEqual(Object.keys(state.addonFunctions.crm), ['localVersion'])
  })

  test('a package that is not installed anywhere says where to add it', async () => {
    await load('@addon/missing')

    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /@addon\/missing, which is not installed/)
    assert.match(
      warnings[0],
      /"@addon\/missing": "workspace:\*".*packages\/functions\/package\.json/
    )
  })

  test('a package that is installed but unbuilt says to build it', async () => {
    const addonDir = join(rootDir, 'node_modules', '@addon', 'unbuilt')
    mkdirSync(addonDir, { recursive: true })
    writeFileSync(
      join(addonDir, 'package.json'),
      JSON.stringify({ name: '@addon/unbuilt' })
    )

    await load('@addon/unbuilt')

    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /is installed at .* but has not been built/)
    assert.match(warnings[0], /pikku-functions-meta\.gen\.json/)
  })
})
