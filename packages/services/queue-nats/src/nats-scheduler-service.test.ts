import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { toNatsCron } from './nats-scheduler-service.js'

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
    assert.equal(toNatsCron('@at 2030-01-01T00:00:00Z'), '@at 2030-01-01T00:00:00Z')
  })
})

describe('toNatsCron — timezone', () => {
  test('no timezone is injected: schedules fire in the server timezone', () => {
    // NATS carries the zone in the `Nats-Schedule-Time-Zone` header, not in the
    // expression, and nothing here sets it — so `0 3 * * *` means 03:00 in
    // whatever zone the server runs, which is UTC by default.
    assert.equal(toNatsCron('0 3 * * *').includes('TZ'), false)
  })

  test('a TZ= prefix is NOT understood — it is counted as a field and passed through', () => {
    // Six tokens, so no seconds field is added and `TZ=Europe/Berlin` lands
    // where the seconds belong. The server rejects it at publish time and
    // `start()` logs and skips that one task, so the failure is loud in the log
    // but the task silently never fires. Do not write schedules this way.
    assert.equal(toNatsCron('TZ=Europe/Berlin 0 3 * * *'), 'TZ=Europe/Berlin 0 3 * * *')
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
