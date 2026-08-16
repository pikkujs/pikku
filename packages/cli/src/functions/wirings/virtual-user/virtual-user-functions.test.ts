import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { serializeVirtualUserFunctions } from './serialize-virtual-user-functions.js'
import { pikkuVirtualUserFunctions } from './pikku-command-virtual-user-functions.js'

const leaf = (name: string) => `#pikku/${name}`

const services = (
  personas: unknown,
  scaffold: unknown = { virtualUser: true }
) =>
  ({
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    config: {
      scaffold,
      virtualUserFunctionsFile:
        '/app/src/scaffold/virtual-user/virtual-user.gen.ts',
      virtualUserSchemasFile:
        '/app/src/scaffold/virtual-user/virtual-user.schemas.gen.ts',
      outDir: '/app/.pikku',
      personasWiringFile: '/app/.pikku/scenarios/pikku-personas.gen.ts',
      packageMappings: {},
    },
    getInspectorState: async () => ({ personas: { definitions: personas } }),
  }) as any

describe('serializeVirtualUserFunctions', () => {
  const { functions: out, schemas } = serializeVirtualUserFunctions(
    leaf,
    '../../../.pikku/workflow/pikku-personas.gen.js'
  )

  test('gates starting a run and reading one on separate scopes', () => {
    assert.match(out, /scopes: \['virtualUser:run'\]/)
    assert.match(out, /scopes: \['virtualUser:read'\]/)
  })

  test('declares the scopes it gates on, so the vocabulary cannot drift', () => {
    assert.match(out, /defineScope\(\{/)
    assert.match(out, /run: \{ description:/)
    assert.match(out, /read: \{ description:/)
  })

  // The correction this whole shape came from: a virtual user explores, so no
  // two attempts take the same steps and there is nothing to replay. Reaching
  // for a workflow or a queue here would be recording it as something it isn't.
  test('dispatches without a workflow and without a queue', () => {
    assert.doesNotMatch(out, /startWorkflow|pikkuWorkflowFunc|wireQueueWorker/)
    assert.match(out, /rpc!\s*\n?\s*\.invoke\('executeVirtualUserRun'/)
  })

  // A held-open request survives neither a rollout nor a proxy timeout, so the
  // run must not be awaited — and an un-caught rejection from a promise nobody
  // awaits takes the process down with it.
  test('kicks the run off unawaited, with the rejection caught', () => {
    assert.match(out, /void rpc!/)
    assert.match(out, /\.catch\(\(\) => \{\}\)/)
  })

  test('records the run before dispatching it, so a crash is still addressable', () => {
    const start = out.indexOf('virtualUserRunStore.start(')
    const dispatch = out.indexOf(".invoke('executeVirtualUserRun'")
    assert.ok(start > 0 && dispatch > start)
  })

  // The seed is what makes a finding reproducible; deciding it inside the
  // engine would lose it whenever a run dies before returning.
  test('seeds the run before the record is written', () => {
    const seed = out.indexOf('const seed = input.seed ??')
    assert.ok(seed > 0 && seed < out.indexOf('virtualUserRunStore.start('))
  })

  test('refuses every disposition but the accountable one in production', () => {
    assert.match(out, /config\.nodeEnv === 'production'/)
    assert.match(out, /disposition !== PRODUCTION_DISPOSITION/)
  })

  // An acted-upon persona has no session of its own, and running one races the
  // scenario that acts on it.
  test('refuses a persona that is declared as acted upon', () => {
    assert.match(out, /!persona\.runnable/)
  })

  test('both outcomes reach the record, since nothing else knows the run happened', () => {
    assert.match(out, /virtualUserRunStore\.complete\(/)
    assert.match(out, /virtualUserRunStore\.fail\(/)
  })

  // Reaching into pikku internals would make this a thing only the framework
  // can do, which is the opposite of a scaffold.
  test('derives everything through the public meta surface', () => {
    assert.match(out, /metaService\.getFunctionsMeta\(\)/)
    assert.doesNotMatch(out, /pikkuState|@pikku\/core\/internal/)
  })

  test('shares its derivation with the CLI rather than repeating it', () => {
    assert.match(out, /prepareVirtualUserRun\(/)
  })

  test('the work is sessionless and unexposed — it has no caller of its own', () => {
    assert.match(
      out,
      /executeVirtualUserRun = pikkuSessionlessFunc\(\{[\s\S]*?tags:/
    )
    const execute = out.slice(out.indexOf('executeVirtualUserRun ='))
    assert.doesNotMatch(execute, /expose: true/)
  })

  test('imports the generated personas rather than declaring any', () => {
    assert.match(
      out,
      /import \{ createPersonas, personaConfigs \} from '\.\.\/\.\.\/\.\.\/\.pikku\/workflow\/pikku-personas\.gen\.js'/
    )
  })

  // A client built before a finding kind existed should still be able to read a
  // run that turned one up.
  test('leaves the finding kind open rather than enumerating today s kinds', () => {
    assert.match(schemas, /kind: z\.string\(\)/)
  })

  test('carries the seed out with the run, so a finding can be replayed', () => {
    assert.match(schemas, /seed: z\.number\(\)/)
  })
})

describe('pikkuVirtualUserFunctions', () => {
  test('is inert when the scaffold is not enabled', async () => {
    const result = await (pikkuVirtualUserFunctions as any).func(
      services({ susan: {} }, {}),
      undefined,
      {}
    )
    assert.equal(result, false)
  })

  // Without a persona the generated RPCs could only ever answer "unknown
  // persona", so codegen refuses rather than shipping them.
  test('fails when the project declares no personas', async () => {
    await assert.rejects(
      (pikkuVirtualUserFunctions as any).func(services({}), undefined, {}),
      /no personas are declared/
    )
  })

  test('the failure says how to fix it', async () => {
    await assert.rejects(
      (pikkuVirtualUserFunctions as any).func(
        services(undefined),
        undefined,
        {}
      ),
      (e: Error) => {
        assert.match(e.message, /definePersonas/)
        assert.match(e.message, /scaffold\.virtualUser/)
        return true
      }
    )
  })
})
