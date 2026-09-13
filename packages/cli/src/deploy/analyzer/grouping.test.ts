import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeDeployment } from './analyzer.js'
import { serviceUnitName, type GroupingConfig } from './grouping.js'
import type { InspectorState } from '@pikku/inspector'

function state(): InspectorState {
  return {
    functions: {
      meta: {
        listRetreats: {
          pikkuFuncId: 'listRetreats',
          name: 'listRetreats',
          tags: ['retreats'],
        },
        bookRetreat: {
          pikkuFuncId: 'bookRetreat',
          name: 'bookRetreat',
          tags: ['bookings'],
          services: { services: ['kysely'] },
        },
        adminPurge: {
          pikkuFuncId: 'adminPurge',
          name: 'adminPurge',
          tags: ['admin', 'heavy'],
          services: { services: ['fileStore'] },
        },
        handleWebhook: {
          pikkuFuncId: 'handleWebhook',
          name: 'handleWebhook',
        },
        sendEmail: {
          pikkuFuncId: 'sendEmail',
          name: 'sendEmail',
          tags: ['retreats'],
        },
        nightlyReport: {
          pikkuFuncId: 'nightlyReport',
          name: 'nightlyReport',
          tags: ['admin'],
        },
      },
    },
    http: {
      meta: {
        get: {
          '/api/retreats': {
            pikkuFuncId: 'listRetreats',
            method: 'get',
            route: '/api/retreats',
          },
        },
        post: {
          '/api/bookings': {
            pikkuFuncId: 'bookRetreat',
            method: 'post',
            route: '/api/bookings',
          },
          '/api/admin/purge': {
            pikkuFuncId: 'adminPurge',
            method: 'post',
            route: '/api/admin/purge',
          },
          '/api/webhooks/stripe': {
            pikkuFuncId: 'handleWebhook',
            method: 'post',
            route: '/api/webhooks/stripe',
          },
        },
      },
    },
    addonFunctions: {
      console: {
        installAddon: {
          pikkuFuncId: 'installAddon',
          name: 'installAddon',
          expose: true,
        },
      },
    },
    agents: { agentsMeta: {} },
    mcpEndpoints: { toolsMeta: {}, resourcesMeta: {}, promptsMeta: {} },
    channels: { meta: {} },
    queueWorkers: {
      meta: { emails: { name: 'emails', pikkuFuncId: 'sendEmail' } },
    },
    scheduledTasks: {
      meta: {
        nightly: {
          name: 'nightly',
          schedule: '0 3 * * *',
          pikkuFuncId: 'nightlyReport',
        },
      },
    },
    workflows: { graphMeta: {} },
    secrets: { definitions: [] },
    variables: { definitions: [] },
  } as unknown as InspectorState
}

const analyze = (grouping?: GroupingConfig) =>
  analyzeDeployment(state(), {
    projectId: 'test',
    serverlessIncompatible: ['fileStore'],
    grouping,
  })

const unitNames = (grouping?: GroupingConfig) =>
  analyze(grouping)
    .units.filter((u) => u.role === 'function')
    .map((u) => u.name)
    .sort()

describe('deploy.grouping - the default', () => {
  test('no config groups by service set', () => {
    assert.deepEqual(unitNames(), [
      'addon-console',
      'svc-base',
      'svc-file-store-server',
      'svc-kysely',
    ])
  })

  test("strategy 'services' with no rules is the same thing", () => {
    assert.deepEqual(unitNames({ strategy: 'services' }), unitNames())
  })

  test("strategy 'function' is still one unit per function", () => {
    assert.deepEqual(unitNames({ strategy: 'function' }), [
      'addon-console',
      'admin-purge',
      'book-retreat',
      'handle-webhook',
      'list-retreats',
      'nightly-report',
      'send-email',
    ])
  })
})

describe('deploy.grouping - tag rules merge', () => {
  const grouping: GroupingConfig = {
    strategy: 'function',
    rules: [{ unit: 'retreats', tags: ['retreats', 'bookings'] }],
  }

  test('functions carrying any listed tag land in the rule unit', () => {
    const unit = analyze(grouping).units.find((u) => u.name === 'retreats')
    assert.ok(unit)
    assert.deepEqual(unit.functionIds.sort(), [
      'bookRetreat',
      'listRetreats',
      'sendEmail',
    ])
  })

  test('the merged unit keeps every route in one fetch handler', () => {
    const unit = analyze(grouping).units.find((u) => u.name === 'retreats')
    const fetchHandlers = unit!.handlers.filter((h) => h.type === 'fetch')
    assert.equal(fetchHandlers.length, 1)
    assert.deepEqual(
      (fetchHandlers[0] as { routes: Array<{ route: string }> }).routes
        .map((r) => r.route)
        .sort(),
      ['/api/bookings', '/api/retreats']
    )
  })

  test('a queue handler stays its own entry beside the fetch handler', () => {
    const unit = analyze(grouping).units.find((u) => u.name === 'retreats')
    assert.ok(
      unit!.handlers.some((h) => h.type === 'queue' && h.queueName === 'emails')
    )
  })

  test('the queue is wired to the grouped unit, not the function name', () => {
    const queue = analyze(grouping).queues.find((q) => q.name === 'emails')
    assert.equal(queue?.consumerUnit, 'retreats')
  })

  test('services are unioned across the members', () => {
    const unit = analyze(grouping).units.find((u) => u.name === 'retreats')
    assert.ok(unit!.services.some((s) => s.capability === 'database'))
  })

  test('tags are unioned across the members', () => {
    const unit = analyze(grouping).units.find((u) => u.name === 'retreats')
    assert.deepEqual(unit!.tags.sort(), ['bookings', 'retreats'])
  })

  test('unmatched functions keep their own units', () => {
    assert.deepEqual(unitNames(grouping), [
      'addon-console',
      'admin-purge',
      'handle-webhook',
      'nightly-report',
      'retreats',
    ])
  })
})

describe('deploy.grouping - ordering', () => {
  test('the first matching rule wins', () => {
    const first = analyze({
      rules: [
        { unit: 'everything', tags: ['retreats'] },
        { unit: 'later', tags: ['retreats'] },
      ],
    })
    assert.ok(first.units.some((u) => u.name === 'everything'))
    assert.ok(!first.units.some((u) => u.name === 'later'))
  })
})

describe('deploy.grouping - route rules', () => {
  test('a glob matches a function with no tags at all', () => {
    const unit = analyze({
      rules: [{ unit: 'webhooks', routes: ['/api/webhooks/*'] }],
    }).units.find((u) => u.name === 'webhooks')
    assert.deepEqual(unit?.functionIds, ['handleWebhook'])
  })

  test('a non-matching glob leaves the function alone', () => {
    assert.ok(
      !analyze({
        rules: [{ unit: 'webhooks', routes: ['/api/nothing/*'] }],
      }).units.some((u) => u.name === 'webhooks')
    )
  })

  test('predicates within one rule are ANDed', () => {
    const units = analyze({
      rules: [
        { unit: 'both', tags: ['retreats'], routes: ['/api/webhooks/*'] },
      ],
    }).units
    assert.ok(!units.some((u) => u.name === 'both'))
  })
})

describe('deploy.grouping - addons', () => {
  test('an addon rule renames the addon unit', () => {
    const units = analyze({
      rules: [{ unit: 'console', addon: 'console' }],
    }).units
    const unit = units.find((u) => u.name === 'console')
    assert.deepEqual(unit?.functionIds, ['console:installAddon'])
    assert.ok(!units.some((u) => u.name === 'addon-console'))
  })

  test('an addon rule never captures app functions', () => {
    const unit = analyze({
      rules: [{ unit: 'console', addon: 'console' }],
    }).units.find((u) => u.name === 'console')
    assert.deepEqual(unit?.functionIds, ['console:installAddon'])
  })
})

describe("deploy.grouping - strategy 'single'", () => {
  test('everything serverless collapses into one unit', () => {
    const names = unitNames({
      strategy: 'single',
      rules: [{ unit: 'purge', tags: ['heavy'] }],
    })
    assert.deepEqual(names, ['addon-console', 'app', 'purge'])
  })

  test('the single unit holds every unmatched function', () => {
    const unit = analyze({
      strategy: 'single',
      rules: [{ unit: 'purge', tags: ['heavy'] }],
    }).units.find((u) => u.name === 'app')
    assert.deepEqual(unit!.functionIds.sort(), [
      'bookRetreat',
      'handleWebhook',
      'listRetreats',
      'nightlyReport',
      'sendEmail',
    ])
  })

  test('the scheduled task follows its function into the group', () => {
    const task = analyze({
      strategy: 'single',
      rules: [{ unit: 'purge', tags: ['heavy'] }],
    }).scheduledTasks.find((t) => t.name === 'nightly')
    assert.equal(task?.unitName, 'app')
  })
})

describe("deploy.grouping - strategy 'services'", () => {
  test('functions sharing a service set share a unit', () => {
    assert.deepEqual(unitNames({ strategy: 'services' }), [
      'addon-console',
      'svc-base',
      'svc-file-store-server',
      'svc-kysely',
    ])
  })

  test('a unit is named after the services it builds', () => {
    const unit = analyze({ strategy: 'services' }).units.find(
      (u) => u.name === 'svc-kysely'
    )
    assert.deepEqual(unit!.functionIds, ['bookRetreat'])
  })

  test('functions that need nothing beyond the base land together', () => {
    const unit = analyze({ strategy: 'services' }).units.find(
      (u) => u.name === 'svc-base'
    )
    assert.deepEqual(unit!.functionIds.sort(), [
      'handleWebhook',
      'listRetreats',
      'nightlyReport',
      'sendEmail',
    ])
  })

  test('a rule still beats the strategy', () => {
    assert.deepEqual(
      unitNames({
        strategy: 'services',
        rules: [{ unit: 'purge', tags: ['heavy'] }],
      }),
      ['addon-console', 'purge', 'svc-base', 'svc-kysely']
    )
  })

  test('the scheduled task follows its function into the service unit', () => {
    const task = analyze({ strategy: 'services' }).scheduledTasks.find(
      (t) => t.name === 'nightly'
    )
    assert.equal(task?.unitName, 'svc-base')
  })

  test('the queue follows its function into the service unit', () => {
    const queue = analyze({ strategy: 'services' }).queues.find(
      (q) => q.name === 'emails'
    )
    assert.equal(queue?.consumerUnit, 'svc-base')
  })

  test('a unit never mixes targets, because the target is part of the key', () => {
    const units = analyze({ strategy: 'services' }).units
    assert.equal(
      units.find((u) => u.name === 'svc-file-store-server')?.target,
      'server'
    )
    assert.equal(units.find((u) => u.name === 'svc-base')?.target, 'serverless')
  })

  test('the same service set on two targets is two units', () => {
    // A function may name `deploy: 'server'` itself while carrying exactly the
    // services a serverless one does. Keying on services alone merged them and
    // hit the mixed-target refusal.
    const s = state()
    s.functions.meta.serverSideEffect = {
      pikkuFuncId: 'serverSideEffect',
      name: 'serverSideEffect',
      deploy: 'server',
      services: { services: ['kysely'] },
    } as never
    ;(s.http.meta as Record<string, unknown>).post = {
      ...(s.http.meta.post as object),
      '/api/side-effect': {
        pikkuFuncId: 'serverSideEffect',
        method: 'post',
        route: '/api/side-effect',
      },
    }
    const units = analyzeDeployment(s, {
      projectId: 'test',
      serverlessIncompatible: ['fileStore'],
      grouping: { strategy: 'services' },
    }).units
    assert.equal(
      units.find((u) => u.name === 'svc-kysely')?.target,
      'serverless'
    )
    assert.equal(
      units.find((u) => u.name === 'svc-kysely-server')?.target,
      'server'
    )
  })
})

describe('deploy.grouping - service unit names', () => {
  test('a server set never collides with the serverless one', () => {
    assert.notEqual(
      serviceUnitName(['kysely'], 'serverless'),
      serviceUnitName(['kysely'], 'server')
    )
    assert.notEqual(
      serviceUnitName([], 'serverless'),
      serviceUnitName([], 'server')
    )
  })

  test('the name is stable under a reordered set', () => {
    assert.equal(
      serviceUnitName(['kysely', 'eventHub']),
      serviceUnitName(['eventHub', 'kysely'])
    )
  })

  test('base services never reach the name', () => {
    assert.equal(
      serviceUnitName(['logger', 'config', 'secrets', 'schema', 'variables']),
      'svc-base'
    )
    assert.equal(
      serviceUnitName(['rpc', 'userSession', 'kysely']),
      'svc-kysely'
    )
  })

  test('a long set keeps a readable head and a digest of the whole', () => {
    const long = [
      'agentRunService',
      'agentRunState',
      'agentRunner',
      'agentStorage',
      'eventHub',
      'kysely',
      'scopeService',
      'workflowService',
    ]
    const name = serviceUnitName(long)
    assert.ok(name.length <= 58, `name too long: ${name}`)
    assert.ok(name.startsWith('svc-agent-run-service'), name)
    // A different set of the same shape must not collide with it.
    assert.notEqual(
      name,
      serviceUnitName([...long.slice(0, 7), 'workflowRunService'])
    )
  })

  test('an unlisted service still keys, so a new service splits a unit', () => {
    assert.notEqual(
      serviceUnitName(['kysely']),
      serviceUnitName(['kysely', 'redis'])
    )
  })
})

describe('deploy.grouping - refusals', () => {
  test('a serverless and a server function cannot share a unit', () => {
    assert.throws(
      () => analyze({ strategy: 'single' }),
      /would hold both serverless and server functions/
    )
  })

  test('the refusal names the functions that disagree', () => {
    assert.throws(() => analyze({ strategy: 'single' }), /adminPurge/)
  })

  test('two rules cannot name the same unit', () => {
    assert.throws(
      () =>
        analyze({
          rules: [
            { unit: 'a', tags: ['retreats'] },
            { unit: 'a', tags: ['admin'] },
          ],
        }),
      /two rules both name the unit "a"/
    )
  })

  test('a rule with no predicate is refused', () => {
    assert.throws(
      () => analyze({ rules: [{ unit: 'a' }] }),
      /rule "a" matches nothing/
    )
  })
})

describe('deploy.grouping - tags written on a wiring', () => {
  const wiringTagged = (grouping?: GroupingConfig) => {
    const s = state() as any
    s.http.meta.post['/api/webhooks/stripe'].tags = ['webhooks']
    s.queueWorkers.meta.emails.tags = ['webhooks']
    s.scheduledTasks.meta.nightly.tags = ['webhooks']
    return analyzeDeployment(s as InspectorState, {
      projectId: 'test',
      serverlessIncompatible: ['fileStore'],
      grouping,
    })
  }

  test('an http wiring tag groups the function it wires', () => {
    const units = wiringTagged({
      rules: [{ unit: 'webhooks', tags: ['webhooks'] }],
    }).units.filter((u) => u.role === 'function')
    const webhooks = units.find((u) => u.name === 'webhooks')
    assert.ok(webhooks, 'no unit named webhooks')
    assert.ok(webhooks.functionIds.includes('handleWebhook'))
  })

  test('queue and cron wiring tags group too', () => {
    const webhooks = wiringTagged({
      rules: [{ unit: 'webhooks', tags: ['webhooks'] }],
    }).units.find((u) => u.name === 'webhooks')
    assert.deepEqual(webhooks?.functionIds.sort(), [
      'handleWebhook',
      'nightlyReport',
      'sendEmail',
    ])
  })

  test('the wiring tag reaches the unit it lands on', () => {
    const unit = wiringTagged({ strategy: 'function' })
      .units.filter((u) => u.role === 'function')
      .find((u) => u.name === 'handle-webhook')
    assert.deepEqual(unit?.tags, ['webhooks'])
  })
})
