import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  FLAG_LANE_ORDER,
  admitsEveryone,
  flagAttentionReason,
  flagLaneOf,
  groupFlagsByLane,
  type FlagBoardRow,
} from './flag-lanes.js'

const flag = (overrides: Partial<FlagBoardRow> = {}): FlagBoardRow => ({
  name: 'quarterlyReports',
  enabled: true,
  rolloutPercent: null,
  declared: true,
  backed: true,
  ...overrides,
})

test('a switched-off flag is dark', () => {
  assert.equal(flagLaneOf(flag({ enabled: false })), 'dark')
})

test('a partial rollout is rolling out', () => {
  assert.equal(flagLaneOf(flag({ rolloutPercent: 25 })), 'rolling')
})

test('a rollout at 100 is live, not rolling out', () => {
  assert.equal(flagLaneOf(flag({ rolloutPercent: 100 })), 'live')
})

test('an unconstrained enabled flag is live', () => {
  assert.equal(flagLaneOf(flag()), 'live')
})

// The panel confirms before a flag goes live for everybody, and it asks this
// rather than reading `rolloutPercent` itself.
test('no rollout and a rollout of 100 both admit everyone', () => {
  assert.equal(admitsEveryone(flag()), true)
  assert.equal(admitsEveryone(flag({ rolloutPercent: 100 })), true)
  assert.equal(admitsEveryone(flag({ rolloutPercent: 99 })), false)
  assert.equal(admitsEveryone(flag({ rolloutPercent: 0 })), false)
})

test('a dark flag with no store row needs attention, not dark', () => {
  const unbacked = flag({ enabled: false, backed: false })
  assert.equal(flagAttentionReason(unbacked), 'unbacked')
  assert.equal(flagLaneOf(unbacked), 'attention')
})

test('a flag whose declaration is gone needs attention whatever its switch says', () => {
  const stale = flag({ declared: false })
  assert.equal(flagAttentionReason(stale), 'undeclared')
  assert.equal(flagLaneOf(stale), 'attention')
})

test('a healthy flag has no attention reason', () => {
  assert.equal(flagAttentionReason(flag()), null)
})

test('grouping keeps every lane, empty ones included', () => {
  const lanes = groupFlagsByLane([flag({ name: 'a', rolloutPercent: 10 })])
  assert.deepEqual(Object.keys(lanes).sort(), [...FLAG_LANE_ORDER].sort())
  assert.deepEqual(
    lanes.rolling.map((f) => f.name),
    ['a']
  )
  assert.deepEqual(lanes.live, [])
  assert.deepEqual(lanes.dark, [])
  assert.deepEqual(lanes.attention, [])
})

test('grouping preserves the order flags arrive in', () => {
  const lanes = groupFlagsByLane([
    flag({ name: 'b' }),
    flag({ name: 'a' }),
    flag({ name: 'c', enabled: false }),
  ])
  assert.deepEqual(
    lanes.live.map((f) => f.name),
    ['b', 'a']
  )
  assert.deepEqual(
    lanes.dark.map((f) => f.name),
    ['c']
  )
})
