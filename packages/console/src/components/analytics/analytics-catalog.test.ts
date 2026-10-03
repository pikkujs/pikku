import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { AnalyticsEventMeta } from '@pikku/core/analytics'
import {
  commonDirPrefix,
  groupEventsByFile,
  relativeTo,
} from './analytics-catalog.js'

const event = (
  name: string,
  file: string,
  props?: Record<string, string>
): AnalyticsEventMeta =>
  ({
    name,
    file,
    variable: 'analyticsEvents',
    props,
  }) as AnalyticsEventMeta

test('no events have no prefix to subtract', () => {
  assert.equal(commonDirPrefix([]), '')
})

test('a single file keeps its own directory as the prefix', () => {
  assert.equal(
    commonDirPrefix(['/home/dev/app/src/analytics.ts']),
    '/home/dev/app/src/'
  )
})

test('the prefix is the deepest directory every file agrees on', () => {
  assert.equal(
    commonDirPrefix([
      '/home/dev/app/src/billing/analytics.ts',
      '/home/dev/app/src/reports/analytics.ts',
    ]),
    '/home/dev/app/src/'
  )
})

// `/home/dev/apple` must not count as a prefix of `/home/dev/app`: the
// comparison is per path SEGMENT, never per character.
test('a directory that merely starts with another is not a prefix of it', () => {
  assert.equal(
    commonDirPrefix(['/home/dev/app/a.ts', '/home/dev/apple/b.ts']),
    '/home/dev/'
  )
})

test('files sharing nothing leave the paths whole', () => {
  const prefix = commonDirPrefix(['/a/one.ts', '/b/two.ts'])
  assert.equal(relativeTo(prefix, '/a/one.ts'), 'a/one.ts')
})

test('a path outside the prefix is left alone rather than sliced', () => {
  assert.equal(
    relativeTo('/home/dev/app/', '/elsewhere/x.ts'),
    '/elsewhere/x.ts'
  )
})

test('groups events by their declaring file, with the prefix subtracted', () => {
  const groups = groupEventsByFile([
    event('report_viewed', '/home/dev/app/src/reports/analytics.ts'),
    event('invoice_paid', '/home/dev/app/src/billing/analytics.ts'),
    event('checkout_completed', '/home/dev/app/src/billing/analytics.ts'),
  ])

  assert.deepEqual(
    groups.map((group) => group.relative),
    ['billing/analytics.ts', 'reports/analytics.ts']
  )
  assert.deepEqual(
    groups[0]!.events.map((e) => e.name),
    ['checkout_completed', 'invoice_paid']
  )
  // The absolute path survives as the group's identity — two modules may both
  // be called analytics.ts, and the display string is not a key.
  assert.equal(groups[0]!.file, '/home/dev/app/src/billing/analytics.ts')
})

test('an event whose props could not be read still gets a group', () => {
  const groups = groupEventsByFile([
    event('opaque', '/home/dev/app/src/analytics.ts', undefined),
  ])

  assert.equal(groups.length, 1)
  assert.equal(groups[0]!.events[0]!.props, undefined)
})
