import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeBranch } from './branch.js'

test('IF node normalizes to a single case with a false fallback slot', () => {
  const spec = normalizeBranch({
    typeShort: 'if',
    parameters: {
      conditions: {
        conditions: [
          {
            leftValue: '={{$json.age}}',
            rightValue: 18,
            operator: { type: 'number', operation: 'largerEqual' },
          },
        ],
      },
    },
  })
  assert.ok(spec)
  assert.equal(spec!.cases.length, 1)
  assert.equal(spec!.cases[0]!.key, '0')
  assert.equal(spec!.cases[0]!.conditions[0]!.operation, 'gte')
  assert.equal(spec!.fallback, '1')
})

test('v2 Switch (rules.values) normalizes one case per rule', () => {
  const spec = normalizeBranch({
    typeShort: 'switch',
    parameters: {
      rules: {
        values: [
          {
            conditions: {
              conditions: [
                {
                  leftValue: '={{$json.type}}',
                  rightValue: 'a',
                  operator: { type: 'string', operation: 'equals' },
                },
              ],
            },
          },
        ],
      },
      options: { fallbackOutput: 'extra' },
    },
  })
  assert.ok(spec)
  assert.equal(spec!.cases.length, 1)
  assert.equal(spec!.fallback, '1')
})

test('v1 Switch (rules.rules with top-level value1/dataType) normalizes each rule', () => {
  const spec = normalizeBranch({
    typeShort: 'switch',
    parameters: {
      value1: '={{$json.github_status}}',
      dataType: 'string',
      rules: {
        rules: [
          { value2: 'same' },
          { output: 1, value2: 'different' },
          { output: 2, value2: 'new' },
        ],
      },
    },
  })
  assert.ok(spec, 'v1 Switch should normalize, not stay a stub')
  assert.equal(spec!.cases.length, 3)
  // Each rule compares the shared left operand (value1) against its value2.
  for (const c of spec!.cases) {
    assert.equal(c.conditions.length, 1)
    assert.equal(c.conditions[0]!.left, '={{$json.github_status}}')
    assert.equal(c.conditions[0]!.type, 'string')
    assert.equal(c.conditions[0]!.operation, 'equals')
  }
  // Case keys follow the rule's `output` slot (defaulting to the rule index),
  // matching the graph `next` Record the topology emits.
  assert.deepEqual(
    spec!.cases.map((c) => c.key),
    ['0', '1', '2']
  )
  assert.deepEqual(
    spec!.cases.map((c) => c.conditions[0]!.right),
    ['same', 'different', 'new']
  )
})

test('v1 Switch honours a numeric dataType and explicit operation', () => {
  const spec = normalizeBranch({
    typeShort: 'switch',
    parameters: {
      value1: '={{$json.score}}',
      dataType: 'number',
      rules: {
        rules: [{ operation: 'larger', value2: 10, output: 0 }],
      },
      fallbackOutput: 1,
    },
  })
  assert.ok(spec)
  assert.equal(spec!.cases[0]!.conditions[0]!.type, 'number')
  assert.equal(spec!.cases[0]!.conditions[0]!.operation, 'gt')
  assert.equal(spec!.fallback, '1')
})
