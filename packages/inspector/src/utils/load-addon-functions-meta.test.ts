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
  writeFileSync(join(addonDir, 'package.json'), JSON.stringify({ name: ADDON }))
  writeFileSync(
    join(pikku, 'function', 'pikku-functions-meta.gen.json'),
    JSON.stringify({})
  )
  writeFileSync(
    join(pikku, 'secrets', 'pikku-secrets-meta.gen.json'),
    JSON.stringify({ slack: { name: 'slack', type: 'string' } })
  )
  writeFileSync(
    join(pikku, 'variables', 'pikku-variables-meta.gen.json'),
    JSON.stringify({ region: { name: 'region' } })
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
            secretOverrides: { slack: 'slack_marketing_secret' },
            variableOverrides: { region: 'marketing_region' },
          },
        ],
        [
          'slack-support',
          {
            package: ADDON,
            secretOverrides: { slack: 'slack_support_secret' },
          },
        ],
      ])
    )

    await loadAddonFunctionsMeta(logger, state)

    const secretNames = state.secrets.definitions.map((d: any) => d.name).sort()
    assert.deepEqual(secretNames, [
      'slack_marketing_secret',
      'slack_support_secret',
    ])

    // slack-marketing overrides region; slack-support has no override, so it
    // falls back to the addon's default variable name.
    const variableNames = state.variables.definitions
      .map((d: any) => d.name)
      .sort()
    assert.deepEqual(variableNames, ['marketing_region', 'region'])
  })

  test('falls back to the addon logical name when no override is provided', async () => {
    const state = makeState(
      rootDir,
      new Map<string, any>([['slack-plain', { package: ADDON }]])
    )

    await loadAddonFunctionsMeta(logger, state)

    assert.deepEqual(
      state.secrets.definitions.map((d: any) => d.name),
      ['slack']
    )
    assert.deepEqual(
      state.variables.definitions.map((d: any) => d.name),
      ['region']
    )
  })
})
