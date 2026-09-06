import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { pikkuState } from '@pikku/core/state'
import {
  NatsSchedulerService,
  parseNatsSchedule,
  toNatsCron,
} from './nats-scheduler-service.js'
import { SCHEDULE_HEADER, SCHEDULE_TIMEZONE_HEADER } from './utils.js'

// NATS cron is seconds-first and rejects anything that is not exactly six
// fields, while pikku's `wireScheduler` takes ordinary five-field crontab. Every
// recurring task goes through this translation, and a wrong result is silent:
// `start()` catches the publish error per task, so a mistranslated schedule
// means that one task simply never fires.
describe('toNatsCron — five-field crontab', () => {
  test('a five-field expression gains a leading seconds field of 0', () => {
    assert.equal(toNatsCron('0 3 * * *'), '0 0 3 * * *')
  })

  test('the added second is 0, so the task fires on the minute, not at a drifting second', () => {
    assert.equal(toNatsCron('*/5 * * * *'), '0 */5 * * * *')
  })

  test('ranges, lists and step values survive untouched', () => {
    assert.equal(toNatsCron('15,45 9-17 * * 1-5'), '0 15,45 9-17 * * 1-5')
  })

  test('irregular whitespace is normalised to single spaces', () => {
    // Split on /\s+/ and rejoined, so tabs and runs of spaces collapse — a
    // six-field expression built from a five-field one is always well formed.
    assert.equal(toNatsCron('0\t3   *  *  *'), '0 0 3 * * *')
  })

  test('surrounding whitespace is trimmed before the field count is taken', () => {
    // Without the trim, a leading space would produce an empty first field and
    // a count of six, and the expression would pass through unprefixed.
    assert.equal(toNatsCron('  0 3 * * *\n'), '0 0 3 * * *')
  })
})

describe('toNatsCron — expressions it leaves alone', () => {
  test('a six-field expression is already NATS-shaped and only gets trimmed', () => {
    assert.equal(toNatsCron(' 30 0 3 * * * '), '30 0 3 * * *')
  })

  test('a NATS interval macro passes through', () => {
    assert.equal(toNatsCron('@every 5m'), '@every 5m')
  })

  test('a one-shot @at passes through', () => {
    assert.equal(
      toNatsCron('@at 2030-01-01T00:00:00Z'),
      '@at 2030-01-01T00:00:00Z'
    )
  })
})

describe('toNatsCron — timezone prefix', () => {
  test('a TZ= prefix is stripped, leaving a schedule the server accepts', () => {
    // Regression. Left in place the prefix lands in the seconds field, and the
    // server rejects the whole schedule (10189) — so the task silently never
    // fired while every other task and the service looked healthy.
    assert.equal(toNatsCron('TZ=Europe/Berlin 0 3 * * *'), '0 0 3 * * *')
  })

  test('CRON_TZ= is understood too, since that is what vixie-cron documents', () => {
    assert.equal(
      toNatsCron('CRON_TZ=America/New_York 30 9 * * 1-5'),
      '0 30 9 * * 1-5'
    )
  })

  test('a prefixed 4-field expression is no longer shifted along by the seconds field', () => {
    // The other half of the same bug: with the prefix counted as a field this
    // was 5 tokens, so a `0` was prepended and every field moved one place —
    // a schedule that is accepted and means something else entirely.
    assert.equal(toNatsCron('TZ=UTC 0 3 * *'), '0 3 * *')
  })

  test('the zone comes back out, since NATS carries it in a header not the expression', () => {
    assert.deepEqual(parseNatsSchedule('TZ=Europe/Berlin 0 3 * * *'), {
      schedule: '0 0 3 * * *',
      timezone: 'Europe/Berlin',
    })
  })

  test('an expression with no prefix reports no zone, meaning the server default', () => {
    assert.deepEqual(parseNatsSchedule('0 3 * * *'), {
      schedule: '0 0 3 * * *',
    })
  })

  test('a six-field expression keeps its own seconds field after the prefix is stripped', () => {
    assert.deepEqual(parseNatsSchedule('TZ=Asia/Tokyo 30 0 3 * * *'), {
      schedule: '30 0 3 * * *',
      timezone: 'Asia/Tokyo',
    })
  })

  test('a bare TZ= with nothing after it is left alone rather than half-parsed', () => {
    // No expression to schedule, so there is nothing to salvage — hand it to
    // the server unchanged and let it reject it, rather than inventing fields.
    assert.deepEqual(parseNatsSchedule('TZ=Europe/Berlin'), {
      schedule: 'TZ=Europe/Berlin',
    })
  })

  test('a zone is never invented for an expression that did not ask for one', () => {
    assert.equal(parseNatsSchedule('*/5 * * * *').timezone, undefined)
    assert.equal(parseNatsSchedule('@every 5m').timezone, undefined)
  })

  test('a macro is not mistaken for a prefixed expression', () => {
    assert.deepEqual(parseNatsSchedule('@every 5m'), { schedule: '@every 5m' })
  })
})

describe('toNatsCron — malformed input', () => {
  test('a wrong field count is passed through rather than rejected here', () => {
    // Deliberate: validation belongs to the server, which knows its own dialect.
    // `start()` publishes each schedule in its own try/catch, so one bad
    // expression is logged and skipped instead of taking every other recurring
    // task down with it.
    assert.equal(toNatsCron('0 3 * *'), '0 3 * *')
    assert.equal(toNatsCron('0 0 3 * * * *'), '0 0 3 * * * *')
  })

  test('an empty expression stays empty rather than becoming a valid schedule', () => {
    // The dangerous outcome would be inventing fields and producing a schedule
    // that fires; an empty string is rejected by the server instead.
    assert.equal(toNatsCron('   '), '')
  })
})

interface Published {
  subject: string
  headers: Record<string, string>
}

/** Seeds the pikku state `start()` reads, and fakes just enough JetStream to
 *  let it register schedules and attach its consumer. */
const harness = (
  tasks: Array<[string, string]>,
  options: { timezone?: string; failOn?: string } = {}
) => {
  const published: Published[] = []
  const errors: string[] = []

  pikkuState(null, 'package', 'singletonServices', {
    logger: {
      info: () => {},
      warn: () => {},
      error: (message: string) => errors.push(message),
      debug: () => {},
    },
  } as any)
  pikkuState(
    null,
    'scheduler',
    'tasks',
    new Map(tasks.map(([name, schedule]) => [name, { name, schedule }])) as any
  )

  const session = {
    stop: () => {},
    status: async function* () {},
    // Never yields and never ends: the supervisor parks in its `for await`
    // without arming a re-attach timer that would outlive the test.
    [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }),
  }

  const js = {
    publish: async (subject: string, _payload: string, opts?: any) => {
      const hdrs: Record<string, string> = {}
      for (const [key] of opts?.headers ?? []) {
        hdrs[key] = opts.headers.get(key)
      }
      published.push({ subject, headers: hdrs })
      if (options.failOn && subject.includes(options.failOn)) {
        throw new Error('message schedules pattern is invalid')
      }
      return { seq: 1 }
    },
    consumers: { get: async () => ({ consume: async () => session }) },
  }
  const jsm = {
    consumers: { add: async () => {}, update: async () => {} },
    streams: {
      info: async () => ({ state: { subjects: {} } }),
      purge: async () => ({}),
    },
  }

  const service = new NatsSchedulerService(
    js as any,
    jsm as any,
    'stream',
    'pikku',
    options.timezone
  )
  return { service, published, errors }
}

describe('NatsSchedulerService.start — schedule registration', () => {
  test('a task whose cron names a zone gets the timezone header', async () => {
    // Regression: the header was defined and exported but never set, so every
    // recurring task fired in the server's zone whatever its author wrote.
    const { service, published } = harness([
      ['nightly', 'TZ=Europe/Berlin 0 3 * * *'],
    ])
    await service.start()
    await service.stop()

    const scheduled = published.find((p) => p.subject.includes('nightly'))!
    assert.equal(scheduled.headers[SCHEDULE_TIMEZONE_HEADER], 'Europe/Berlin')
    // ...and the zone is out of the expression, which is what the server parses.
    assert.equal(scheduled.headers[SCHEDULE_HEADER], '0 0 3 * * *')
  })

  test('a service-level zone applies to tasks that do not name one', async () => {
    const { service, published } = harness([['nightly', '0 3 * * *']], {
      timezone: 'America/New_York',
    })
    await service.start()
    await service.stop()

    const scheduled = published.find((p) => p.subject.includes('nightly'))!
    assert.equal(
      scheduled.headers[SCHEDULE_TIMEZONE_HEADER],
      'America/New_York'
    )
  })

  test("a task's own zone beats the service default", async () => {
    const { service, published } = harness(
      [['nightly', 'TZ=Asia/Tokyo 0 3 * * *']],
      {
        timezone: 'America/New_York',
      }
    )
    await service.start()
    await service.stop()

    assert.equal(
      published.find((p) => p.subject.includes('nightly'))!.headers[
        SCHEDULE_TIMEZONE_HEADER
      ],
      'Asia/Tokyo'
    )
  })

  test('no zone and UTC both send no header at all', async () => {
    // The server rejects the whole schedule if it cannot resolve the zone name
    // against its own tzdata, so an absent header — which already means UTC —
    // is safer than naming UTC explicitly.
    const { service, published } = harness([['a', '0 3 * * *']])
    await service.start()
    await service.stop()
    assert.equal(
      published.find((p) => p.subject.includes('a'))!.headers[
        SCHEDULE_TIMEZONE_HEADER
      ],
      undefined
    )

    const utc = harness([['b', 'TZ=UTC 0 3 * * *']])
    await utc.service.start()
    await utc.service.stop()
    assert.equal(
      utc.published.find((p) => p.subject.includes('b'))!.headers[
        SCHEDULE_TIMEZONE_HEADER
      ],
      undefined
    )
  })
})

describe('NatsSchedulerService.start — schedules that fail to register', () => {
  test('a task that could not be registered is recorded and named, not just logged past', async () => {
    // The failure this guards is the quiet one: the per-task catch keeps one bad
    // expression from taking the rest down, but on its own `start()` returned as
    // if everything registered while that task never fired again.
    const { service, errors } = harness(
      [
        ['good', '0 3 * * *'],
        ['broken', 'not a cron'],
      ],
      { failOn: 'broken' }
    )

    await service.start()
    await service.stop()

    assert.deepEqual([...service.failedSchedules.keys()], ['broken'])
    assert.ok(
      errors.some((e) => e.includes('broken') && e.includes('not a cron')),
      'the per-task failure names the task and its expression'
    )
    assert.ok(
      errors.some((e) => e.includes('will never fire') && e.includes('broken')),
      'and a summary says plainly that this process has a task that will never fire'
    )
  })

  test('a clean start records no failures', async () => {
    const { service } = harness([['good', '0 3 * * *']])
    await service.start()
    await service.stop()
    assert.equal(service.failedSchedules.size, 0)
  })
})
