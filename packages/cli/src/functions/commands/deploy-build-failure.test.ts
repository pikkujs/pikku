import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { InspectorState } from '@pikku/inspector'

import { deployPlan } from './deploy-plan.js'
import { deployApply } from './deploy-apply.js'
import type { Bundler } from '../../deploy/bundler/bundler.interface.js'
import type { BundleError } from '../../deploy/bundler/types.js'

/**
 * A single-unit provider written into the project as a plain module, so the
 * deploy commands run their real resolveProvider path without a provider
 * package being installed. `deployed` records whether apply reached the deploy
 * step.
 */
const deployed: string[] = []

const PROVIDER_SOURCE = `
export const createAdapter = () => ({
  name: 'fake',
  deployDirName: 'fake',
  singleUnit: true,
  generateEntrySource: () => 'export default {}',
  generateUnitConfigs: () => new Map(),
  generateInfraManifest: () => null,
  supportedRuntimes: ['bun'],
  deploy: async () => {
    globalThis.__pikkuFakeProviderDeployed.push('deploy')
    if (globalThis.__pikkuFakeProviderThrows) throw new Error('upload refused')
    return globalThis.__pikkuFakeProviderResult ?? { success: true, workersDeployed: [], resourcesCreated: [], errors: [] }
  },
})
`

const writeProviderModule = (): string => {
  const file = join(root, 'fake-provider.mjs')
  writeFileSync(file, PROVIDER_SOURCE, 'utf-8')
  return pathToFileURL(file).href
}

let root: string
let providerUrl: string
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
    providers: { fake: providerUrl },
    provider: 'fake',
  },
  backends: { api: { filter: {} } },
})

const inspectorState = (): InspectorState =>
  ({
    rootDir: root,
    serviceAggregation: { requiredServices: new Set<string>() },
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
  mkdirSync(join(root, '.pikku', 'backends', 'api'), { recursive: true })
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'todo-app' }),
    'utf-8'
  )
  providerUrl = writeProviderModule()
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  const globals = globalThis as Record<string, unknown>
  delete globals.__pikkuFakeProviderDeployed
  delete globals.__pikkuFakeProviderResult
  delete globals.__pikkuFakeProviderThrows
  process.exitCode = 0
})

describe('deploy plan provider resolution', () => {
  test('refuses a project that names no deploy provider', async () => {
    await assert.rejects(
      () =>
        deployPlan.func(
          {
            logger,
            config: {
              ...config(),
              deploy: { providers: { fake: providerUrl } },
            },
            getInspectorState: async () => inspectorState(),
            bundler: bundlerWith([]),
          } as never,
          {} as never,
          {} as never
        ),
      /No deploy provider for backend 'api'.*"provider"/
    )
  })

  test('takes the provider from the backend that sets one', async () => {
    await deployPlan.func(
      {
        logger,
        config: {
          ...config(),
          deploy: { providers: { fake: providerUrl } },
          backends: { api: { filter: {}, deploy: { provider: 'fake' } } },
        },
        getInspectorState: async () => inspectorState(),
        bundler: bundlerWith([]),
      } as never,
      {} as never,
      {} as never
    )
  })
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

describe('deploy plan without backend units', () => {
  test('writes a successful result file and an empty manifest', async () => {
    writeFileSync(
      join(root, 'multi-provider.mjs'),
      PROVIDER_SOURCE.replace('singleUnit: true', 'singleUnit: false'),
      'utf-8'
    )
    providerUrl = pathToFileURL(join(root, 'multi-provider.mjs')).href
    const resultFile = join(root, 'result.json')
    await deployPlan.func(
      {
        logger,
        config: config(),
        getInspectorState: async () => ({
          ...inspectorState(),
          http: { meta: {} },
        }),
        bundler: bundlerWith([]),
      } as never,
      { resultFile } as never,
      {} as never
    )
    const result = JSON.parse(readFileSync(resultFile, 'utf-8'))
    assert.equal(result.success, true)
    assert.equal(result.unitCount, 0)
    const manifest = JSON.parse(
      readFileSync(
        join(result.providerDir, 'deployment-manifest.json'),
        'utf-8'
      )
    )
    assert.deepEqual(manifest.units, [])
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

describe('deploy apply outcome', () => {
  const failed = {
    success: false,
    errors: [{ step: 'upload', error: 'worker rejected' }],
  }

  test('a deploy that reports failure exits non-zero', async () => {
    ;(globalThis as Record<string, unknown>).__pikkuFakeProviderResult = failed
    await run(deployApply, [])
    assert.deepEqual(deployed, ['deploy'])
    assert.equal(process.exitCode, 1)
  })

  test('a deploy that throws exits non-zero', async () => {
    ;(globalThis as Record<string, unknown>).__pikkuFakeProviderThrows = true
    await run(deployApply, [])
    assert.equal(process.exitCode, 1)
  })

  test('a deploy that succeeds leaves the exit code alone', async () => {
    await run(deployApply, [])
    assert.deepEqual(deployed, ['deploy'])
    assert.ok(!process.exitCode)
  })

  test('the failure is in the result file too', async () => {
    ;(globalThis as Record<string, unknown>).__pikkuFakeProviderResult = failed
    const resultFile = join(root, 'result.json')
    await run(deployApply, [], { resultFile })
    const result = JSON.parse(readFileSync(resultFile, 'utf-8'))
    assert.equal(result.success, false)
    assert.equal(process.exitCode, 1)
  })
})

describe('deploy apply --fromPlan', () => {
  test('applies a single-unit plan, which writes no infra.json', async () => {
    await run(deployPlan, [])
    assert.ok(
      existsSync(join(root, '.deploy', 'fake', 'deployment-manifest.json'))
    )
    assert.ok(!existsSync(join(root, '.deploy', 'fake', 'infra.json')))

    await run(deployApply, [], { fromPlan: true })
    assert.deepEqual(deployed, ['deploy'])
  })
})

describe('deploy plan keeps what apply would build', () => {
  test('plan stages a backend deploy.embed, so a --fromPlan apply ships it', async () => {
    writeFileSync(join(root, 'seed.txt'), 'seed', 'utf-8')
    await deployPlan.func(
      {
        logger,
        config: {
          ...config(),
          backends: {
            api: { filter: {}, deploy: { embed: { seed: 'seed.txt' } } },
          },
        },
        getInspectorState: async () => inspectorState(),
        bundler: bundlerWith([]),
      } as never,
      {} as never,
      {} as never
    )
    assert.ok(
      logs.some((line) => line.startsWith('Embedded:')),
      logs.join('\n')
    )
  })
})

describe('deploy apply --runtime', () => {
  test('a runtime the provider has is accepted', async () => {
    await run(deployApply, [], { runtime: 'bun' })
    assert.deepEqual(deployed, ['deploy'])
  })

  test('any other runtime is refused before anything is built', async () => {
    await assert.rejects(
      () => run(deployApply, [], { runtime: 'node' }),
      /provider 'fake' does not run on 'node'.*bun/
    )
    assert.deepEqual(deployed, [])
    assert.ok(!existsSync(join(root, '.deploy')))
  })
})
