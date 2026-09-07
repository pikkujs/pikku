import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseHelpText } from './parseHelpText.js'

test('plain copy is one text segment', () => {
  assert.deepEqual(parseHelpText('no anchors here.'), [
    { text: 'no anchors here.' },
  ])
})

test('an anchor splits out of the surrounding text', () => {
  assert.deepEqual(parseHelpText('see [this list](#list) now'), [
    { text: 'see ' },
    { text: 'this list', anchor: 'list' },
    { text: ' now' },
  ])
})

test('several anchors in one paragraph', () => {
  assert.deepEqual(parseHelpText('[a](#one) and [b](#two-b)'), [
    { text: 'a', anchor: 'one' },
    { text: ' and ' },
    { text: 'b', anchor: 'two-b' },
  ])
})

test('malformed anchors stay literal text', () => {
  for (const input of [
    'empty [label](#) target',
    'unclosed [label without a bracket',
    'bare (#anchor) with no label',
    'spaces [label](# anchor) inside',
  ]) {
    assert.deepEqual(parseHelpText(input), [{ text: input }], input)
  }
})

test('empty copy yields no segments', () => {
  assert.deepEqual(parseHelpText(''), [])
})
