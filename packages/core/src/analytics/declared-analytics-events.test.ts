import { beforeEach, describe, test } from 'node:test'
import * as assert from 'node:assert'
import { pikkuState, resetPikkuState } from '../pikku-state.js'
import {
  assertAnalyticsSinksDeclared,
  getDeclaredAnalyticsEvents,
} from './declared-analytics-events.js'
import { createAnalyticsSinks, fanOutAnalytics } from './fan-out-analytics.js'
import type { AnalyticsRecord, AnalyticsService } from './analytics.types.js'

const record = (name: string): AnalyticsRecord => ({
  name,
  occurredAt: '2026-11-22T10:00:00.000Z',
  userIdentity: { userId: 'u1' },
  source: 'server',
})

const collector = () => {
  const seen: string[] = []
  const sink: AnalyticsService = {
    write: async (batch) => void seen.push(...batch.map((r) => r.name)),
  }
  return { seen, sink }
}

const register = (...names: string[]) =>
  pikkuState(
    null,
    'analytics',
    'meta',
    Object.fromEntries(names.map((name) => [name, { name }]))
  )

beforeEach(() => resetPikkuState())

describe('getDeclaredAnalyticsEvents', () => {
  test('returns the names the bootstrap registered', () => {
    register('page_viewed', 'checkout_completed')
    assert.deepEqual(getDeclaredAnalyticsEvents(), [
      'page_viewed',
      'checkout_completed',
    ])
  })

  test('returns an empty list when the app declares none', () => {
    register()
    assert.deepEqual(getDeclaredAnalyticsEvents(), [])
  })

  test('refuses, naming the module, when the bootstrap never registered them', () => {
    assert.throws(
      () => getDeclaredAnalyticsEvents(),
      /analytics\/pikku-analytics-meta\.gen\.ts/
    )
  })

  test('a sink mapped from them gets declared events and not an undeclared one', async () => {
    register('page_viewed')
    const { seen, sink } = collector()
    const sinks = createAnalyticsSinks()
    sinks.add(
      sink,
      Object.fromEntries(getDeclaredAnalyticsEvents().map((n) => [n, true]))
    )
    await fanOutAnalytics(sinks, collector().sink).write([
      record('page_viewed'),
      record('not_declared'),
    ])
    assert.deepEqual(seen, ['page_viewed'])
  })
})

describe('assertAnalyticsSinksDeclared', () => {
  test('passes with no registry, or a registry with no sinks', () => {
    assert.doesNotThrow(() => assertAnalyticsSinksDeclared(undefined))
    assert.doesNotThrow(() =>
      assertAnalyticsSinksDeclared(createAnalyticsSinks())
    )
  })

  test('passes when sinks are registered and events are declared', () => {
    register('page_viewed')
    const sinks = createAnalyticsSinks()
    sinks.add(collector().sink, { page_viewed: true })
    assert.doesNotThrow(() => assertAnalyticsSinksDeclared(sinks))
  })

  test('refuses sinks when the app declares no events', () => {
    register()
    const sinks = createAnalyticsSinks()
    sinks.add(collector().sink, {})
    assert.throws(
      () => assertAnalyticsSinksDeclared(sinks),
      /1 analytics sink is registered, but the app declares no analytics events/
    )
  })

  test('refuses sinks when the declared events were never registered', () => {
    const sinks = createAnalyticsSinks()
    sinks.add(collector().sink, { page_viewed: true })
    assert.throws(
      () => assertAnalyticsSinksDeclared(sinks),
      /did not import analytics\/pikku-analytics-meta\.gen\.ts/
    )
  })
})
