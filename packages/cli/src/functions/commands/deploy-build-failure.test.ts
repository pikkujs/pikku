import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { InspectorState } from '@pikku/inspector'

import { deployPlan } from './deploy-plan.js'
import { deployApply } from './deploy-apply.js'
import type { Bundler } from '../../deploy/bundler/bundler.interface.js'
import type { BundleError } from '../../deploy/bundler/types.js'

/**
 * A single-unit provider loaded straight from a data: URL, so the deploy
 * commands run their real resolveProvider path without a provider package
 * being installed. `deployed` records whether apply reached the deploy step.
 */
const deployed: string[] = []

const providerModule = (): string =>
  `data:text/javascript,${encodeURIComponent(`
    export const createAdapter = () => ({
      name: 'fake',
      deployDirName: 'fake',
      singleUnit: true,
      generateEntrySource: () => 'export default {}',
      generateUnitConfigs: () => new Map(),
      generateInfraManifest: () => null,
      deploy: async () => {
        globalThis.__pikkuFakeProviderDeployed.push('deploy')
        return { success: true, workersDeployed: [], resourcesCreated: [], errors: [] }
      },
    })
  `)}`

let root: string
let logs: string[]

const logger = {
  info: (msg: string) => logs.push(String(msg)),
  warn: (msg: string) => logs.push(String(msg)),
  error: (msg: string) => logs.push(String(msg)),
  debug: () => {},
}

const config = () => ({
  rootDir: root,
  outDir: join(root, '.pikku'),
  deploy: {
    providers: { fake: providerModule() },
    defaultProvider: 'fake',
  },
})

const inspectorState = (): InspectorState =>
  ({
    rootDir: root,
    functions: {
      meta: { createTodo: { pikkuFuncId: 'createTodo', name: 'createTodo' } },
    },
    http: {
      meta: {
        post: {
          '/todo': {
            pikkuFuncId: 'createTodo',
            method: 'post',
            route: '/todo',
          },
        },
      },
    },
    agents: { agentsMeta: {} },
    mcpEndpoints: { toolsMeta: {}, resourcesMeta: {}, promptsMeta: {} },
    channels: { meta: {} },
    queueWorkers: { meta: {} },
    scheduledTasks: { meta: {} },
    workflows: { graphMeta: {} },
    secrets: { definitions: [], usage: [] },
    variables: { definitions: [] },
    filesAndMethods: {
      pikkuConfigFactory: {
        file: join(root, 'src', 'config.ts'),
        variable: 'createConfig',
      },
      singletonServicesFactory: {
        file: join(root, 'src', 'services.ts'),
        variable: 'createSingletonServices',
      },
    },
  }) as unknown as InspectorState

const bundlerWith = (errors: BundleError[]): Bundler => ({
  bundleUnits: async () => ({
    results: errors.length
      ? []
      : [
          {
            unitName: 'unit',
            bundlePath: join(root, 'bundle.js'),
            packageJsonPath: join(root, 'package.json'),
            exactDependenciesPath: join(root, 'exact.json'),
            metafilePath: join(root, 'metafile.json'),
            bundleSizeBytes: 10,
            bundleHash: 'hash',
            exactDependenciesHash: 'dephash',
            exactDependencies: {},
            exactOptionalDependencies: {},
          },
        ],
    errors,
  }),
})

const RESOLVE_FAILURE: BundleError = {
  unitName: 'todo-unit',
  error: 'Could not resolve "./missing-service.js"',
}

const run = async (
  command: typeof deployPlan | typeof deployApply,
  errors: BundleError[],
  data: Record<string, unknown> = {}
) =>
  command.func(
    {
      logger,
      config: config(),
      getInspectorState: async () => inspectorState(),
      bundler: bundlerWith(errors),
    } as never,
    data as never,
    {} as never
  )

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pikku-deploy-build-'))
  logs = []
  deployed.length = 0
  ;(globalThis as Record<string, unknown>).__pikkuFakeProviderDeployed =
    deployed
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, '.pikku'), { recursive: true })
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'todo-app' }),
    'utf-8'
  )
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  delete (globalThis as Record<string, unknown>).__pikkuFakeProviderDeployed
})

describe('deploy plan bundle failures', () => {
  test('throws when a unit failed to bundle', async () => {
    await assert.rejects(
      () => run(deployPlan, [RESOLVE_FAILURE]),
      (error: Error) => {
        assert.match(error.message, /todo-unit/)
        assert.match(error.message, /missing-service/)
        return true
      }
    )
  })

  test('still writes the result file before failing', async () => {
    const resultFile = join(root, 'result.json')
    await assert.rejects(() =>
      run(deployPlan, [RESOLVE_FAILURE], { resultFile })
    )
    const result = JSON.parse(readFileSync(resultFile, 'utf-8'))
    assert.equal(result.success, false)
    assert.deepEqual(result.errors, [RESOLVE_FAILURE])
  })

  test('resolves when every unit bundled', async () => {
    await run(deployPlan, [])
  })
})

describe('deploy apply bundle failures', () => {
  test('throws and never deploys when a unit failed to bundle', async () => {
    await assert.rejects(
      () => run(deployApply, [RESOLVE_FAILURE]),
      (error: Error) => {
        assert.match(error.message, /todo-unit/)
        return true
      }
    )
    assert.deepEqual(deployed, [])
  })

  test('writes a failing result file before failing', async () => {
    const resultFile = join(root, 'result.json')
    await assert.rejects(() =>
      run(deployApply, [RESOLVE_FAILURE], { resultFile })
    )
    const result = JSON.parse(readFileSync(resultFile, 'utf-8'))
    assert.equal(result.success, false)
  })

  test('deploys when every unit bundled', async () => {
    await run(deployApply, [])
    assert.deepEqual(deployed, ['deploy'])
  })
})
