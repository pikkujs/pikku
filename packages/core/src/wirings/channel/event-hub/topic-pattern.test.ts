import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { matchesTopicPattern, topicPatternsOverlap } from './topic-pattern.js'

describe('matchesTopicPattern', () => {
  test('a literal pattern matches only itself', () => {
    assert.equal(matchesTopicPattern('orders', 'orders'), true)
    assert.equal(matchesTopicPattern('orders', 'orders:1'), false)
  })

  test('${string} matches any text, including none', () => {
    assert.equal(matchesTopicPattern('order:${string}', 'order:42'), true)
    assert.equal(matchesTopicPattern('order:${string}', 'order:'), true)
    assert.equal(matchesTopicPattern('order:${string}', 'board:42'), false)
  })

  test('a pattern is anchored at both ends', () => {
    assert.equal(matchesTopicPattern('order:${string}', 'x-order:42'), false)
    assert.equal(
      matchesTopicPattern('org:${string}:orders', 'org:7:orders:extra'),
      false
    )
    assert.equal(
      matchesTopicPattern('org:${string}:orders', 'org:7:orders'),
      true
    )
  })

  test('${number} only matches a number', () => {
    assert.equal(matchesTopicPattern('job:${number}', 'job:12'), true)
    assert.equal(matchesTopicPattern('job:${number}', 'job:12.5'), true)
    assert.equal(matchesTopicPattern('job:${number}', 'job:abc'), false)
  })

  test('regex characters in a literal part are literal', () => {
    assert.equal(matchesTopicPattern('a.b', 'a.b'), true)
    assert.equal(matchesTopicPattern('a.b', 'axb'), false)
  })
})

describe('topicPatternsOverlap', () => {
  test('two literals overlap only when equal', () => {
    assert.equal(topicPatternsOverlap('orders', 'orders'), true)
    assert.equal(topicPatternsOverlap('orders', 'boards'), false)
  })

  test('a wildcard overlaps a literal it matches', () => {
    assert.equal(topicPatternsOverlap('order:${string}', 'order:1'), true)
    assert.equal(topicPatternsOverlap('order:1', 'order:${string}'), true)
    assert.equal(topicPatternsOverlap('order:${string}', 'board:1'), false)
  })

  test('two wildcards overlap when a string could match both', () => {
    assert.equal(
      topicPatternsOverlap('order:${string}', 'order:${string}'),
      true
    )
    assert.equal(
      topicPatternsOverlap('org:${string}:orders', 'org:7:${string}'),
      true
    )
    assert.equal(topicPatternsOverlap('a:${string}', 'b:${string}'), false)
    assert.equal(
      topicPatternsOverlap('${string}:orders', '${string}:boards'),
      false
    )
  })

  test('${number} is treated as a wildcard, so overlap errs towards refusing', () => {
    assert.equal(topicPatternsOverlap('job:${number}', 'job:abc'), true)
  })
})

describe('topicPatternsOverlap, wildcard against wildcard', () => {
  test('a bare wildcard overlaps any pattern', () => {
    assert.equal(topicPatternsOverlap('${string}', '${string}:x'), true)
    assert.equal(topicPatternsOverlap('${string}:x', '${string}'), true)
    assert.equal(topicPatternsOverlap('${string}', 'order:${string}'), true)
  })

  test('mid-string wildcards on both sides', () => {
    assert.equal(topicPatternsOverlap('a${string}c', 'ab${string}'), true)
    assert.equal(topicPatternsOverlap('a${string}c', 'x${string}'), false)
    assert.equal(topicPatternsOverlap('${string}ab', '${string}cb'), false)
  })
})
