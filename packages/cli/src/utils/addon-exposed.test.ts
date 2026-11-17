import assert from 'node:assert'
import { test } from 'node:test'
import { addonExposedFunctions, addonExposedIds } from './addon-exposed.js'

const state = (expose: boolean | string[] | undefined) =>
  ({
    addonFunctions: {
      tools: { greet: { expose: true }, hidden: {} },
    },
    rpc: {
      wireAddonDeclarations: new Map([['tools', { package: 'p', expose }]]),
    },
  }) as any

test('a wiring that exposes the addon carries the functions it declared exposed', () => {
  assert.deepEqual(addonExposedFunctions(state(true)), { tools: ['greet'] })
  assert.deepEqual(addonExposedIds(state(true)), ['tools:greet'])
})

test('a wiring that does not opt in exposes nothing', () => {
  assert.deepEqual(addonExposedIds(state(undefined)), [])
})

test('a list names exactly the functions, and only declared ones count', () => {
  assert.deepEqual(addonExposedIds(state(['hidden'])), [])
  assert.deepEqual(addonExposedIds(state(['greet'])), ['tools:greet'])
})
