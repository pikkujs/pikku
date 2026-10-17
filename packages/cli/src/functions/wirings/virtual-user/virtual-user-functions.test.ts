import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { serializeVirtualUserFunctions } from './serialize-virtual-user-functions.js'
import { pikkuVirtualUserFunctions } from './pikku-command-virtual-user-functions.js'
import {
  findPlatformUserId,
  PLATFORM_USER_EMAIL,
  PLATFORM_USER_ID,
} from '@pikku/better-auth'

const leaf = (name: string) => `#pikku/${name}`

const services = (
  virtualUsers: unknown,
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
      virtualUsersWiringFile:
        '/app/.pikku/scenarios/pikku-virtual-users.gen.ts',
      packageMappings: {},
    },
    getInspectorState: async () => ({
      virtualUsers: { definitions: virtualUsers },
    }),
  }) as any

describe('serializeVirtualUserFunctions', () => {
  const { functions: out, schemas } = serializeVirtualUserFunctions(
    leaf,
    '../../../.pikku/workflow/pikku-virtual-users.gen.js'
  )

  test('offers a way to ask what the virtual users have been doing', () => {
    assert.match(out, /export const listVirtualUserRuns = pikkuFunc\(/)
    assert.match(out, /\)\.list\(\{ virtualUserId, limit, offset \}\)/)
  })

  // The steps are the bulk of a run, so a list that carried them would make
  // reading the history cost a budget's worth of transcript per row.
  test('the transcript is its own read, not a field on the run', () => {
    assert.match(out, /export const getVirtualUserRunSteps = pikkuFunc\(/)
    assert.match(out, /\)\.steps\(runId, \{ limit, offset \}\)/)
    assert.doesNotMatch(schemas, /steps: z\.array\(Step\),\n  tally/)
  })

  // An adversarial run's transcript carries the live ids and payloads it
  // actually sent — strictly more sensitive than the summary it belongs to.
  test('reading a transcript needs the same scope as reading a finding', () => {
    const stepsFn = out.slice(out.indexOf('getVirtualUserRunSteps'))
    assert.match(stepsFn, /scopes: \['virtualUser:read'\]/)
  })

  test('a virtual user can be put on a clock rather than triggered by hand', () => {
    assert.match(out, /export const setVirtualUserSchedule = pikkuFunc\(/)
    assert.match(out, /writeVirtualUserSchedule\(\{/)
  })

  // Starting a run spends money once, with a caller present to see it. Writing
  // a schedule spends it repeatedly with nobody there.
  test('deciding a virtual user keeps running is its own scope', () => {
    assert.match(out, /schedule: \{\n\s+description:/)
    const setFn = out.slice(out.indexOf('setVirtualUserSchedule ='))
    assert.match(setFn, /scopes: \['virtualUser:schedule'\]/)
  })

  // A schedule is enabled once and then outlives the declaration it was written
  // from, so both sides have to travel for anyone to see they have parted ways.
  test('a schedule carries what the virtual user currently declares', () => {
    assert.match(schemas, /declared: z\.object\(\{/)
    assert.match(
      out,
      /serializeVirtualUserSchedule\(schedule, virtualUserConfigs\)/
    )
  })

  // Which fields differ is a question about how to render two values, and the
  // answer belongs where they are rendered — not baked into the payload.
  test('the difference is left for the client to work out', () => {
    assert.doesNotMatch(out, /drifted/)
    assert.doesNotMatch(schemas, /drifted/)
  })

  // A codegen step does not get to decide that an app starts spending model
  // budget; the project wires the tick when it means it.
  test('the tick is emitted unwired, with no scaffolded cron behind it', () => {
    assert.match(
      out,
      /tickVirtualUserSchedules = pikkuSessionlessFunc<void, void>/
    )
    // Only ever inside the doc comment showing how, never at the top level.
    assert.doesNotMatch(out, /^wireScheduler\(/m)
    const tickFn = out.slice(out.indexOf('tickVirtualUserSchedules ='))
    assert.doesNotMatch(tickFn, /expose: true/)
  })

  test('an app with no schedule store wired still ticks harmlessly', () => {
    const tickFn = out.slice(out.indexOf('tickVirtualUserSchedules ='))
    assert.match(
      tickFn,
      /if \(!virtualUserScheduleStore \|\| !virtualUserRunStore\) \{\n\s+return/
    )
  })

  // The checks are the point — an acted-upon virtual user has no session, and only
  // one disposition may ever touch production. A helper the tick called instead
  // would be a second copy of them, and would eventually drift.
  test('a scheduled run goes through the same door a person does', () => {
    const tickFn = out.slice(out.indexOf('tickVirtualUserSchedules ='))
    assert.match(tickFn, /rpc!\.invoke\(\s*'runVirtualUser',/)
    assert.doesNotMatch(out, /const startVirtualUserRun = /)
  })

  // A cron has no caller and no header, so without a session it cannot invoke
  // the scope-gated RPC above, and nothing it writes can be attributed. The
  // identity is the reserved platform user — not an invented service account,
  // which the directory would have to learn to ignore.
  test('the tick runs as the platform user', () => {
    assert.match(out, /const PLATFORM_USER_ID = 'pikku-platform'/)
    assert.doesNotMatch(out, /@pikku\/better-auth/)
    assert.match(
      out,
      /export const virtualUserPlatformSession = pikkuMiddleware\(/
    )
    assert.match(
      out,
      /setInitialSession\?\.\(\{\n\s+userId: PLATFORM_USER_ID,\n\s+scopes: \['virtualUser:run'\],\n\s+\} as Session\)/
    )
    // Attached to the task's own middleware — tag middleware over `/rpc` cannot
    // set a session at all.
    assert.match(out, / \* {3}middleware: \[virtualUserPlatformSession\],/)
  })

  // Under uuid or serial ids the platform row is not `pikku-platform`, so a
  // session naming that literal would attribute every scheduled run to a user
  // that does not exist.
  test('with better-auth, the tick looks the platform user up by its address', () => {
    const { functions } = serializeVirtualUserFunctions(
      leaf,
      '../../../.pikku/workflow/pikku-virtual-users.gen.js',
      { betterAuth: true }
    )
    assert.match(
      functions,
      /import \{ findPlatformUserId, PLATFORM_USER_ID \} from '@pikku\/better-auth'/
    )
    assert.doesNotMatch(functions, /const PLATFORM_USER_ID = /)
    assert.match(
      functions,
      /\(context && \(await findPlatformUserId\(context\.internalAdapter\)\)\) \?\?\n\s+PLATFORM_USER_ID/
    )
    assert.match(
      functions,
      /async \(\{ auth \}, \{ setInitialSession \}, next\) => \{\n\s+setInitialSession\?\.\(\{\n\s+userId: await platformUserId\(auth\),/
    )
  })

  test('the generated lookup resolves the row better-auth assigned', async () => {
    const { functions } = serializeVirtualUserFunctions(
      leaf,
      '../../../.pikku/workflow/pikku-virtual-users.gen.js',
      { betterAuth: true }
    )
    const start = functions.indexOf('const platformUserId = ')
    const end = functions.indexOf('\n}\n', start) + 3
    const js = new Bun.Transpiler({ loader: 'ts' }).transformSync(
      `${functions.slice(start, end)}\nreturn platformUserId`
    )
    const platformUserId = new Function(
      'findPlatformUserId',
      'PLATFORM_USER_ID',
      js
    )(findPlatformUserId, PLATFORM_USER_ID)
    const authWith = (row: { id: string } | null) => async () => ({
      $context: Promise.resolve({
        internalAdapter: {
          findUserByEmail: async (email: string) =>
            row && email === PLATFORM_USER_EMAIL ? { user: row } : null,
        },
      }),
    })

    assert.equal(
      await platformUserId(authWith({ id: '0b7c5e1a-uuid' })),
      '0b7c5e1a-uuid'
    )
    assert.equal(await platformUserId(authWith(null)), 'pikku-platform')
    assert.equal(await platformUserId(undefined), 'pikku-platform')
  })

  // A run is capped by a budget; how often runs happen is the schedule. The two
  // were being confused for each other before this existed.
  test('the cadence is a range, so the virtual user does not keep an appointment', () => {
    assert.match(
      schemas,
      /minIntervalMs: z\.number\(\)\.int\(\)\.min\(60_000\)\.optional\(\)/
    )
    assert.match(
      schemas,
      /maxIntervalMs: z\.number\(\)\.int\(\)\.min\(60_000\)\.optional\(\)/
    )
  })

  test('gates starting a run and reading one on separate scopes', () => {
    assert.match(out, /scopes: \['virtualUser:run'\]/)
    assert.match(out, /scopes: \['virtualUser:read'\]/)
  })

  test('declares the scopes it gates on, so the vocabulary cannot drift', () => {
    assert.match(out, /defineScope\(\{/)
    assert.match(out, /run: \{ description:/)
    assert.match(out, /read: \{ description:/)
  })

  // A virtual user explores, so no two attempts take the same steps and there
  // is nothing to replay — it is still not a workflow. It does need a trigger:
  // a deployment that puts each function in its own unit has no in-process
  // promise to leave running, and no way to reach a function nothing triggers.
  test('dispatches onto a queue, not into a workflow', () => {
    assert.doesNotMatch(out, /startWorkflow|pikkuWorkflowFunc/)
    assert.match(
      out,
      /wireQueueWorker\(\{\s*name: 'pikku-virtual-user-runs',[\s\S]*?func: executeVirtualUserRun,/
    )
    assert.match(out, /queueService\.add\('pikku-virtual-user-runs', job/)
  })

  // A redelivery is a second different outing writing into a record that
  // already has an outcome, so the job is never retried.
  test('the run is dispatched at one attempt', () => {
    assert.match(out, /attempts: 1/)
  })

  // A project with no queue service runs in the one process, where the
  // in-process dispatch is correct. A held-open request survives neither a
  // rollout nor a proxy timeout, so the run must not be awaited — and an
  // un-caught rejection from a promise nobody awaits takes the process down.
  test('falls back to an unawaited invoke when there is no queue', () => {
    assert.match(out, /if \(queueService\) \{/)
    assert.match(out, /void rpc!\.invoke\('executeVirtualUserRun', job\)/)
    assert.match(out, /\.catch\(\(\) => \{\}\)/)
  })

  test('records the run before dispatching it, so a crash is still addressable', () => {
    const start = out.indexOf('await startVirtualUserRun({')
    const dispatch = out.indexOf('const job = {')
    assert.ok(start > 0 && dispatch > start)
  })

  // Reaching into pikku internals would make this a thing only the framework
  // can do, which is the opposite of a scaffold.
  test('derives everything through the public surface', () => {
    assert.doesNotMatch(out, /pikkuState|@pikku\/core\/internal/)
  })

  // A cadence production refuses would fail every tick with nobody watching, so
  // the write has to know which environment it is in to refuse it up front.
  test('a schedule write is told which environment it is in', () => {
    assert.match(
      out,
      /writeVirtualUserSchedule\(\{[^}]*environments: virtualUserEnvironments,[^}]*config: config/
    )
  })

  // What is generated is the part that varies by application. Everything else
  // is a call into `@pikku/core/virtual-user`, where it is type checked when
  // core builds and fixed once rather than in every generated copy of it.
  test('the bodies are calls into core, not a second copy of it', () => {
    const bodies = [
      /await startVirtualUserRun\(\{/,
      /serializeVirtualUserRun\(run\)/,
      /serializeVirtualUserSteps\(steps\)/,
      /await writeVirtualUserSchedule\(\{/,
      /logVirtualUserTick\(/,
      /executeRun\(\{/,
    ]
    for (const body of bodies) {
      assert.match(out, body)
    }
    // The work itself, rather than the wiring, is nowhere in the output.
    assert.doesNotMatch(out, /prepareVirtualUserRun\(|runVirtualUserEngine\(/)
    assert.doesNotMatch(out, /metaService\.get|variables\.get\(/)
    assert.doesNotMatch(out, /\.complete\(runId|\.fail\(runId/)
  })

  test('the work is sessionless and unexposed — it has no caller of its own', () => {
    assert.match(
      out,
      /executeVirtualUserRun = pikkuSessionlessFunc\(\{[\s\S]*?tags:/
    )
    const execute = out.slice(out.indexOf('executeVirtualUserRun ='))
    assert.doesNotMatch(execute, /expose: true/)
  })

  test('imports the generated virtual users rather than declaring any', () => {
    assert.match(
      out,
      /import \{ createVirtualUsers, virtualUserConfigs, virtualUserEnvironments \} from '\.\.\/\.\.\/\.\.\/\.pikku\/workflow\/pikku-virtual-users\.gen\.js'/
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

  // A run is already inside the app, so it asks the app's own auth for its
  // session. A credential on the request would only be something to leak.
  test('a run takes no credential in and signs in through the auth service', () => {
    assert.doesNotMatch(schemas, /secret|credential|bearer/i)
    assert.match(out, /auth: await auth\?\.\(\)/)
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

  // Without a virtual user the generated RPCs could only ever answer "unknown
  // virtual user", so codegen refuses rather than shipping them.
  test('fails when the project declares no virtual users', async () => {
    await assert.rejects(
      (pikkuVirtualUserFunctions as any).func(services({}), undefined, {}),
      /no virtual users are declared/
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
        assert.match(e.message, /defineVirtualUsers/)
        assert.match(e.message, /scaffold\.virtualUser/)
        return true
      }
    )
  })
})
