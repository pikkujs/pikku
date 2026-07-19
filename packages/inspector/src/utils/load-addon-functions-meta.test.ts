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
    mcpEndpoints: { toolsMeta: {} },
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
