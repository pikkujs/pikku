import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert'
import {
  wireTrigger,
  wireTriggerSource,
  getRegisteredTriggers,
  getTriggerMeta,
} from './trigger-runner.js'
import { resetPikkuState, pikkuState } from '../../pikku-state.js'

beforeEach(() => {
  resetPikkuState()
})

describe('wireTrigger', () => {
  test('should register a trigger when meta exists', () => {
    const meta = pikkuState(null, 'trigger', 'meta')
    ;(meta as any)['myTrigger'] = { pikkuFuncId: 'triggerFunc' }

    wireTrigger({ name: 'myTrigger', func: async () => {} } as any)

    const triggers = getRegisteredTriggers()
    assert.ok(triggers.has('myTrigger'))
  })

  test('should skip when trigger metadata not found', () => {
    wireTrigger({ name: 'noMeta', func: async () => {} } as any)

    const triggers = getRegisteredTriggers()
    assert.ok(!triggers.has('noMeta'))
  })
})

describe('wireTriggerSource', () => {
  test('should register a trigger source when meta exists', () => {
    const sourceMeta = pikkuState(null, 'trigger', 'sourceMeta')
    ;(sourceMeta as any)['mySource'] = { pikkuFuncId: 'sourceFunc' }

    wireTriggerSource({ name: 'mySource', func: async () => {} } as any)

    const sources = pikkuState(null, 'trigger', 'triggerSources')
    assert.ok(sources.has('mySource'))
  })

  test('should skip when trigger source metadata not found', () => {
    wireTriggerSource({ name: 'noMeta', func: async () => {} } as any)

    const sources = pikkuState(null, 'trigger', 'triggerSources')
    assert.ok(!sources.has('noMeta'))
  })

  test('should throw when trigger source already exists', () => {
    const sourceMeta = pikkuState(null, 'trigger', 'sourceMeta')
    ;(sourceMeta as any)['dupSource'] = { pikkuFuncId: 'sourceFunc' }

    wireTriggerSource({ name: 'dupSource', func: async () => {} } as any)

    assert.throws(
      () =>
        wireTriggerSource({ name: 'dupSource', func: async () => {} } as any),
      { message: 'Trigger source already exists: dupSource' }
    )
  })
})

describe('getRegisteredTriggers', () => {
  test('should return the triggers Map', () => {
    const triggers = getRegisteredTriggers()
    assert.ok(triggers instanceof Map)
  })
})

describe('getTriggerMeta', () => {
  test('should return the trigger meta object', () => {
    const meta = getTriggerMeta()
    assert.ok(typeof meta === 'object')
  })
})
