import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { toKebab } from './analyzer.js'

describe('toKebab', () => {
  test('converts camelCase to kebab-case', () => {
    assert.equal(toKebab('myFunction'), 'my-function')
    assert.equal(toKebab('createUser'), 'create-user')
  })

  test('converts PascalCase to kebab-case', () => {
    assert.equal(toKebab('CreateUser'), 'create-user')
    assert.equal(toKebab('HTTPServer'), 'http-server')
  })

  test('sanitizes colons', () => {
    assert.equal(
      toKebab('workflowStart:myWorkflow'),
      'workflow-start-my-workflow'
    )
    assert.equal(
      toKebab('http:options:/rpc/:rpcName'),
      'http-options-rpc-rpc-name'
    )
  })

  test('sanitizes slashes', () => {
    assert.equal(toKebab('http:get:/todos/:id'), 'http-get-todos-id')
  })

  test('collapses consecutive dashes', () => {
    assert.equal(toKebab('a::b'), 'a-b')
    assert.equal(toKebab('a://b'), 'a-b')
  })

  test('strips leading and trailing dashes', () => {
    assert.equal(toKebab(':leadingColon'), 'leading-colon')
    assert.equal(toKebab('/leadingSlash'), 'leading-slash')
  })

  test('handles already kebab-case', () => {
    assert.equal(toKebab('my-function'), 'my-function')
  })

  test('handles graph function IDs', () => {
    assert.equal(
      toKebab('graphStart:todoReviewWorkflow:fetchOverdue'),
      'graph-start-todo-review-workflow-fetch-overdue'
    )
  })
})
