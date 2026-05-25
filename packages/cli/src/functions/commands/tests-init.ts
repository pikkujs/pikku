import { existsSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { dirname, join, relative } from 'path'
import { pikkuSessionlessFunc } from '#pikku'

const toJs = (p: string) => p.replace(/\.(?:d\.)?ts$/, '.js')

// ---------------------------------------------------------------------------
// Template generators
// ---------------------------------------------------------------------------

function packageJson(): string {
  return JSON.stringify(
    {
      name: 'function-tests',
      version: '0.0.1',
      private: true,
      type: 'module',
      description:
        'Function test harness — Cucumber over in-process Pikku RPC with stubbed services.',
      scripts: {
        test: "node --env-file=.env.test node_modules/.bin/cucumber-js --config tests/cucumber.mjs --tags 'not @skip'",
        'test:tag':
          'node --env-file=.env.test node_modules/.bin/cucumber-js --config tests/cucumber.mjs --tags',
        tsc: 'tsc --noEmit',
      },
      dependencies: {
        '@pikku/cucumber': '^0.12.0',
        '@pikku/kysely-node-sqlite': '^0.12.0',
      },
      devDependencies: {
        '@cucumber/cucumber': '^11.0.0',
        '@types/node': '^22',
        tsx: '^4.21.0',
        typescript: '~5.8.0',
      },
    },
    null,
    2
  )
}

function tsconfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        types: ['node'],
        noEmit: true,
        skipLibCheck: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        strict: true,
      },
      include: ['tests/**/*.ts'],
    },
    null,
    2
  )
}

function envTest(): string {
  return `# Environment variables required by createConfig() during tests.
# Add any env vars your config.ts reads at module load time.
# This file is loaded via --env-file and is NOT committed to version control.
NODE_ENV=test
`
}

function cucumberMjs(): string {
  return `export default {
  requireModule: ['tsx'],
  require: ['tests/support/**/*.ts', 'tests/steps/**/*.ts'],
  paths: ['tests/features/**/*.feature'],
  format: ['progress', 'html:tests/reports/cucumber-report.html'],
  forceExit: true,
}
`
}

function hooksTs(bootstrapImport: string): string {
  return `import '${bootstrapImport}'
import { Before, After, BeforeAll, AfterAll, setDefaultTimeout, Given, When, Then } from '@cucumber/cucumber'
import { registerHooks, registerCommonSteps } from '@pikku/cucumber'
import { db } from './services.js'

registerHooks({ Before, After, BeforeAll, AfterAll, setDefaultTimeout }, db)
registerCommonSteps({ Given, When, Then })
`
}

function worldTs(): string {
  return `import { World, setWorldConstructor } from '@cucumber/cucumber'
import { createFunctionWorld } from '@pikku/cucumber'
import { createStubServices } from './services.js'

createFunctionWorld(World, setWorldConstructor, createStubServices)
`
}

function servicesTs(
  configImport: string,
  servicesImport: string,
  schemaImport: string,
  coercionImport: string,
  configVar: string,
  servicesVar: string,
  repoRootRel: string,
  hasDb: boolean
): string {
  if (!hasDb) {
    return `import { createDbUtils, type StubTracker } from '@pikku/cucumber'
import { ${configVar} } from '${configImport}'
import { ${servicesVar} } from '${servicesImport}'

export const db = createDbUtils({ migrationsDir: '', seedFile: '' })

export async function createStubServices(_dbFile: string, tracker: StubTracker) {
  const injected = new Proxy({} as Record<string, unknown>, {
    get(_, prop: string) { return tracker.stub(prop) },
  })
  const config = await ${configVar}()
  const services = await ${servicesVar}(config as never, injected as never)
  return { services }
}
`
  }

  return `import { createNodeSqliteKysely, createCoercionPlugin } from '@pikku/kysely-node-sqlite'
import { createDbUtils, type StubTracker } from '@pikku/cucumber'
import { ${configVar} } from '${configImport}'
import { ${servicesVar} } from '${servicesImport}'
import { coercionMap } from '${coercionImport}'
import type { DB } from '${schemaImport}'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = (p: string) => resolve(__dirname, '${repoRootRel}', p)

export const db = createDbUtils({
  migrationsDir: repoRoot('db/migrations'),
  seedFile: repoRoot('db/seed.sql'),
})

type StubKysely = ReturnType<typeof createNodeSqliteKysely<DB>>

const REAL_SERVICES = (kysely: StubKysely) => ({ kysely })

export async function createStubServices(dbFile: string, tracker: StubTracker) {
  const kysely = createNodeSqliteKysely<DB>({
    filename: dbFile,
    camelCase: true,
    plugins: [createCoercionPlugin({ map: coercionMap })],
  })

  const real = REAL_SERVICES(kysely)
  const injected = new Proxy(real as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      return tracker.stub(prop)
    },
  })

  const config = await ${configVar}()
  const services = await ${servicesVar}(
    { ...config, dev: { db: { file: dbFile } } } as never,
    injected as never,
  )

  return { services, kysely }
}
`
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const pikkuTestsInit = pikkuSessionlessFunc<{ force?: boolean }, void>({
  func: async ({ logger, config, getInspectorState }, input) => {
    const force = input?.force

    const state = await getInspectorState(true)
    const { pikkuConfigFactory, singletonServicesFactory } =
      state.filesAndMethods

    if (!pikkuConfigFactory) {
      logger.error(
        'createConfig not found — ensure it is exported from your project'
      )
      process.exit(1)
    }
    if (!singletonServicesFactory) {
      logger.error(
        'createSingletonServices not found — ensure it is exported from your project'
      )
      process.exit(1)
    }

    const packageMappings = config.packageMappings ?? {}
    const srcDirs: string[] =
      (config as { srcDirectories?: string[] }).srcDirectories ?? []
    const functionsRelDir =
      Object.keys(packageMappings).find((key) =>
        srcDirs.some((src) => src === key || src.startsWith(key + '/'))
      ) ?? Object.keys(packageMappings)[0]
    if (!functionsRelDir) {
      logger.error(
        'packageMappings must have at least one entry pointing to your functions package'
      )
      process.exit(1)
    }

    const functionsDir = join(config.rootDir, functionsRelDir)
    const ftestDir = join(functionsDir, 'function-tests')

    if (existsSync(ftestDir) && !force) {
      logger.error(
        `function-tests directory already exists at ${ftestDir}. Use --force to overwrite.`
      )
      process.exit(1)
    }

    const supportDir = join(ftestDir, 'tests', 'support')

    const rel = (abs: string) => {
      const r = relative(supportDir, abs)
      return r.startsWith('.') ? r : './' + r
    }

    const bootstrapImport = toJs(
      rel(join(config.outDir, 'pikku-bootstrap.gen.ts'))
    )
    const configImport = toJs(rel(pikkuConfigFactory.file))
    const servicesImport = toJs(rel(singletonServicesFactory.file))
    // coercion/schema may live under outDir/db (new default) or rootDir/db (legacy)
    const schemaInOutDir = join(config.outDir, 'db', 'schema.d.ts')
    const schemaInRootDir = join(config.rootDir, 'db', 'schema.d.ts')
    const schemaFile = existsSync(schemaInOutDir)
      ? schemaInOutDir
      : schemaInRootDir
    const coercionInOutDir = join(config.outDir, 'db', 'coercion.gen.ts')
    const coercionInRootDir = join(config.rootDir, 'db', 'coercion.gen.ts')
    const coercionFile = existsSync(coercionInOutDir)
      ? coercionInOutDir
      : coercionInRootDir
    const schemaImport = toJs(rel(schemaFile))
    const coercionImport = toJs(rel(coercionFile))
    const repoRootRel = relative(supportDir, config.rootDir)
    const hasDb = existsSync(join(config.rootDir, 'db', 'migrations'))

    const files: Array<[string, string]> = [
      [join(ftestDir, '.env.test'), envTest()],
      [join(ftestDir, 'package.json'), packageJson()],
      [join(ftestDir, 'tsconfig.json'), tsconfig()],
      [join(ftestDir, 'tests', 'cucumber.mjs'), cucumberMjs()],
      [join(supportDir, 'hooks.ts'), hooksTs(bootstrapImport)],
      [join(supportDir, 'world.ts'), worldTs()],
      [
        join(supportDir, 'services.ts'),
        servicesTs(
          configImport,
          servicesImport,
          schemaImport,
          coercionImport,
          pikkuConfigFactory.variable,
          singletonServicesFactory.variable,
          repoRootRel,
          hasDb
        ),
      ],
      [join(ftestDir, 'tests', 'features', '.gitkeep'), ''],
    ]

    for (const [filePath, content] of files) {
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, content, 'utf-8')
      logger.info(`  created ${relative(config.rootDir, filePath)}`)
    }

    logger.info('\nFunction test harness initialized.')
    logger.info('Next steps:')
    logger.info('  1. Add your first .feature file under tests/features/')
    logger.info('  2. Install @pikku/cucumber and run: yarn test')
  },
})
