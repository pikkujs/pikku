import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Checkbox, Radio, Switch } from './index.js'

test('toggles wrapped for `original` keep their Mantine statics', () => {
  assert.notEqual((Radio as any).Group, undefined)
  assert.notEqual((Checkbox as any).Group, undefined)
  assert.notEqual((Switch as any).Group, undefined)
})
