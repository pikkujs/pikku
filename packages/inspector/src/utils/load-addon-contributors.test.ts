import { strict as assert } from 'assert'
import { describe, test, beforeEach, afterEach } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadAddonFunctionsMeta } from './load-addon-functions-meta.js'
import type { InspectorState, InspectorLogger } from '../types.js'

const ADDON = '@addon/cloud'

const writeAddon = (rootDir: string, pikku: unknown) => {
  writeFileSync(
    join(rootDir, 'package.json'),
    JSON.stringify({ name: 'consumer' })
  )
  const addonDir = join(rootDir, 'node_modules', ADDON)
  mkdirSync(addonDir, { recursive: true })
  writeFileSync(
    join(addonDir, 'package.json'),
    JSON.stringify({ name: ADDON, pikku })
  )
  return addonDir
}

const makeState = (
  rootDir: string,
  declarations: Array<[string, Record<string, unknown>]>
): InspectorState =>
  ({
    rootDir,
    rpc: { wireAddonDeclarations: new Map(declarations) },
    addonFunctions: {},
    secrets: { definitions: [] },
    variables: { definitions: [] },
    credentials: { definitions: [] },
    mcpEndpoints: { toolsMeta: {}, surfaces: {} },
    addonServerlessIncompatible: new Map(),
    addonRequiredParentServices: [],
    exportedContracts: { addonHttp: {}, addonCli: {}, addonChannel: {} },
  }) as unknown as InspectorState

const recordingLogger = () => {
  const errors: string[] = []
  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (message: string) => errors.push(message),
    critical: () => {},
    diagnostic: () => {},
  } as unknown as InspectorLogger
  return { logger, errors }
}

describe('loadAddonFunctionsMeta — addon-declared contributors', () => {
  let rootDir: string

  beforeEach(() => {
    rootDir = realpathSync(mkdtempSync(join(tmpdir(), 'pikku-addon-contrib-')))
  })

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true })
  })

  test('records the package.json pikku.contributors and where they resolve from', async () => {
    const addonDir = writeAddon(rootDir, {
      contributors: [
        { module: '@addon/cloud/contributors', export: 'cloudSession' },
        { module: './dist/stage.js' },
      ],
    })
    const state = makeState(rootDir, [['cloud', { package: ADDON }]])

    await loadAddonFunctionsMeta(recordingLogger().logger, state)

    assert.deepEqual(state.addonContributors, {
      cloud: {
        packageName: ADDON,
        packageDir: addonDir,
        contributors: [
          { module: '@addon/cloud/contributors', export: 'cloudSession' },
          { module: './dist/stage.js' },
        ],
      },
    })
  })

  test('an addon declaring none records nothing', async () => {
    writeAddon(rootDir, { uses: [] })
    const state = makeState(rootDir, [['cloud', { package: ADDON }]])

    await loadAddonFunctionsMeta(recordingLogger().logger, state)

    assert.equal(state.addonContributors, undefined)
  })

  test('a remote addon contributes nothing to the host', async () => {
    writeAddon(rootDir, { contributors: [{ module: './x.js' }] })
    const state = makeState(rootDir, [
      ['cloud', { package: ADDON, remote: true }],
    ])

    await loadAddonFunctionsMeta(recordingLogger().logger, state)

    assert.equal(state.addonContributors, undefined)
  })

  test('a malformed declaration is reported against the wiring', async () => {
    writeAddon(rootDir, { contributors: [{ export: 'missingModule' }] })
    const state = makeState(rootDir, [['cloud', { package: ADDON }]])
    const { logger, errors } = recordingLogger()

    await loadAddonFunctionsMeta(logger, state)

    assert.equal(state.addonContributors, undefined)
    assert.equal(errors.length, 1)
    assert.match(
      errors[0]!,
      /wireAddon\('cloud'\): @addon\/cloud declares pikku\.contributors .* not a list of \{ module, export\? \}/
    )
  })
})
