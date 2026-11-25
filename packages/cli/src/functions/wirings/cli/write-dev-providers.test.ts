import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { devBaselineFor, writeDevProviders } from './write-dev-providers.js'

const scratchRoot = () => {
  const dir = join(import.meta.dir, '../../../..', '.tmp')
  mkdirSync(dir, { recursive: true })
  return dir
}

const logger = new Proxy({}, { get: () => () => {} }) as never

describe('writeDevProviders', () => {
  let root: string
  let file: string
  const config = (extra: Record<string, unknown> = {}) =>
    ({
      rootDir: root,
      outDir: root,
      sourceDirs: ['src'],
      devProvidersFile: file,
      packageMappings: {},
      db: { engine: 'sqlite' },
      ...extra,
    }) as never
  const state = (
    providers: Record<string, unknown>,
    optedInProviders: Record<string, unknown> = {}
  ) =>
    ({
      providers,
      optedInProviders,
      agents: { agentsMeta: {} },
      serviceAggregation: {
        requiredServices: new Set(
          [
            ...Object.values(providers),
            ...Object.values(optedInProviders).flatMap((opted) =>
              Object.values((opted as { providers: object }).providers ?? {})
            ),
          ].flatMap((meta) =>
            Object.values(
              (meta as { variants: Record<string, { provides: string[] }> })
                .variants
            ).flatMap((variant) => variant.provides)
          )
        ),
      },
      rpc: {
        wireAddonDeclarations: new Map([
          ['ns', { file: join(root, 'src/a.ts') }],
        ]),
      },
    }) as never
  const service = (variants: Record<string, unknown>) => ({
    module: join(root, 'src/services.ts'),
    export: 'svc',
    variants,
  })

  beforeEach(() => {
    root = mkdtempSync(join(scratchRoot(), 'pikku-write-dev-services-'))
    file = join(root, 'services', 'dev.gen.ts')
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  test('nothing declared writes nothing and removes a stale file', async () => {
    mkdirSync(join(root, 'services'))
    writeFileSync(file, 'stale')
    await writeDevProviders(logger, config(), state({}))
    assert.equal(existsSync(file), false)
  })

  test('a declared service is written, resolved against the dev baseline', async () => {
    await writeDevProviders(
      logger,
      config(),
      state({
        cache: service({
          common: { needs: ['kysely', 'logger'], provides: ['cache'] },
        }),
      })
    )
    const source = readFileSync(file, 'utf8')
    assert.match(source, /target: "dev"/)
    assert.match(source, /registry\.add\("cache"/)
  })

  test('a need the dev baseline does not hold fails the build naming it', async () => {
    await assert.rejects(
      writeDevProviders(
        logger,
        config({ db: undefined }),
        state({
          cache: service({
            common: { needs: ['kysely'], provides: ['cache'] },
          }),
        })
      ),
      /'cache' needs 'kysely' on dev/
    )
  })

  test('a deploy-only service nothing in dev provides fails the build', async () => {
    await assert.rejects(
      writeDevProviders(
        logger,
        config(),
        state({
          cache: service({ deploy: { needs: [], provides: ['cache'] } }),
        })
      ),
      /no dev variant and no common variant/
    )
  })

  test('a deploy-only service for a key dev already holds is left out of dev', async () => {
    mkdirSync(join(root, 'services'))
    writeFileSync(file, 'stale')
    await writeDevProviders(
      logger,
      config(),
      state({
        queue: service({ deploy: { needs: [], provides: ['queueService'] } }),
      })
    )
    assert.equal(existsSync(file), false)
  })

  test('a service only the project factory reads is written', async () => {
    const reached = (projectServicesRead?: string[]) => {
      const st = state({
        nats: service({ common: { needs: [], provides: ['nats'] } }),
      }) as unknown as {
        serviceAggregation: { requiredServices: Set<string> }
        projectServicesRead?: string[]
      }
      st.serviceAggregation.requiredServices = new Set()
      st.projectServicesRead = projectServicesRead
      return st as never
    }
    await writeDevProviders(logger, config(), reached())
    assert.equal(existsSync(file), false)
    await writeDevProviders(logger, config(), reached(['nats']))
    assert.match(readFileSync(file, 'utf8'), /registry\.add\("nats"/)
  })

  test('an addon never gets a dev runner', async () => {
    await writeDevProviders(
      logger,
      config({ addon: { displayName: 'x' } }),
      state({ cache: service({ common: { needs: [], provides: ['cache'] } }) })
    )
    assert.equal(existsSync(file), false)
  })
})

describe('devBaselineFor', () => {
  const agents = (names: string[]) =>
    ({
      agents: { agentsMeta: Object.fromEntries(names.map((n) => [n, {}])) },
      serviceAggregation: { requiredServices: new Set<string>() },
    }) as never

  test('kysely follows the config db and agentRunner follows the agents', () => {
    const none = devBaselineFor({ db: undefined } as never, agents([]))
    assert.ok(!none.includes('kysely') && !none.includes('agentRunner'))
    const both = devBaselineFor(
      { db: { engine: 'sqlite' } } as never,
      agents(['a'])
    )
    assert.ok(both.includes('kysely') && both.includes('agentRunner'))
  })

  test('pikku serve holds no credentialService', () => {
    const state = agents([])
    assert.ok(
      devBaselineFor({} as never, state, 'dev').includes('credentialService')
    )
    assert.ok(
      !devBaselineFor({} as never, state, 'serve').includes('credentialService')
    )
  })
})
