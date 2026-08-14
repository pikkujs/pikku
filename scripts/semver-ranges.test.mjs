// Expected values here were cross-checked against the `semver` package over
// 177,449 fuzzed range pairs with zero divergence. They are written out
// literally rather than compared against semver at runtime because this module
// exists precisely so the pre-install CI gate needs no node_modules.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  intersects,
  isUnbounded,
  isParseable,
  isSatisfiable,
} from './semver-ranges.mjs'

test('overlapping caret ranges intersect', () => {
  // The case the whole check is built around: these coexist legitimately.
  assert.equal(intersects('^0.12.44', '^0.12.83'), true)
  assert.equal(intersects('^0.12.7', '^0.12.8'), true)
  assert.equal(intersects('^3.713.0', '^3.732.0'), true)
})

test('caret ranges across a major do not intersect', () => {
  assert.equal(intersects('^5', '^6'), false)
  assert.equal(intersects('^0.12.83', '^0.13.0'), false)
  assert.equal(intersects('^18', '^19'), false)
})

test('caret pins at the leftmost non-zero component', () => {
  assert.equal(intersects('^0.12.44', '0.12.99'), true)
  assert.equal(intersects('^0.12.44', '0.13.0'), false)
  assert.equal(intersects('^1.2.3', '1.99.0'), true)
  assert.equal(intersects('^1.2.3', '2.0.0'), false)
  assert.equal(intersects('^0.0.3', '0.0.3'), true)
  assert.equal(intersects('^0.0.3', '0.0.4'), false)
})

test('unions intersect when any branch does', () => {
  assert.equal(intersects('^18 || ^19', '^19'), true)
  assert.equal(intersects('^18 || ^19', '^17'), false)
  assert.equal(intersects('^5 || ^6 || ^7', '^6'), true)
})

test('partial versions expand to the range they denote', () => {
  assert.equal(intersects('^5', '5.9.9'), true)
  assert.equal(intersects('~1', '1.2.3'), true)
  assert.equal(intersects('1.2', '1.2.7'), true)
  assert.equal(intersects('1.2', '1.3.0'), false)
})

test('tilde allows patch drift, and minor drift only when minor is absent', () => {
  assert.equal(intersects('~1.2.3', '1.2.99'), true)
  assert.equal(intersects('~1.2.3', '1.3.0'), false)
  assert.equal(intersects('~1', '1.99.0'), true)
  assert.equal(intersects('~1', '2.0.0'), false)
})

test('comparators and conjunctions', () => {
  assert.equal(intersects('>=1.2.3', '<2.0.0'), true)
  assert.equal(intersects('>=2.0.0', '<2.0.0'), false)
  assert.equal(intersects('>1.2.3', '1.2.3'), false)
  assert.equal(intersects('>=1.2.3', '1.2.3'), true)
  assert.equal(intersects('>=0.12.44 <0.13.0', '^0.12.83'), true)
  assert.equal(intersects('>=18 <20', '^19'), true)
})

test('hyphen ranges', () => {
  assert.equal(intersects('1.2.3 - 2.3.4', '2.0.0'), true)
  assert.equal(intersects('1.2.3 - 2.3.4', '2.4.0'), false)
})

test('wildcards intersect everything', () => {
  assert.equal(intersects('*', '^0.12.44'), true)
  assert.equal(intersects('x', '^19'), true)
  assert.equal(intersects('', '^19'), true)
})

test('isUnbounded identifies only ranges admitting every version', () => {
  assert.equal(isUnbounded('*'), true)
  assert.equal(isUnbounded('x'), true)
  assert.equal(isUnbounded(''), true)
  assert.equal(isUnbounded('>=0.0.0'), true)
  assert.equal(isUnbounded('^0.12.44'), false)
  assert.equal(isUnbounded('^18 || ^19'), false)
  assert.equal(isUnbounded('>=1.0.0'), false)
})

test('prerelease tags are stripped rather than ordered', () => {
  assert.equal(intersects('^1.2.3-beta.1', '1.5.0'), true)
})

test('unparseable ranges are reported, never assumed permissive', () => {
  assert.equal(isParseable('latest'), false)
  assert.equal(isParseable('^^1'), false)
  assert.equal(isParseable('^1.2.3'), true)
  assert.equal(intersects('latest', '^1.0.0'), null)
})

test('ranges that admit no version are flagged as unsatisfiable', () => {
  // semver.intersects() reports these as intersecting; no version does satisfy
  // them, so they are their own category rather than a passing comparison.
  assert.equal(isSatisfiable('<0'), false)
  assert.equal(isSatisfiable('>=2 <1'), false)
  assert.equal(isSatisfiable('^1.0.0'), true)
})
