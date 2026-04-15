import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { toSafeKebab } from './analyzer.js'

describe('toSafeKebab', () => {
  test('converts camelCase to kebab-case', () => {
    assert.equal(toSafeKebab('myFunction'), 'my-function')
    assert.equal(toSafeKebab('createUser'), 'create-user')
  })

  test('converts PascalCase to kebab-case', () => {
    assert.equal(toSafeKebab('CreateUser'), 'create-user')
    assert.equal(toSafeKebab('HTTPServer'), 'http-server')
  })

  test('sanitizes colons', () => {
    assert.equal(
      toSafeKebab('workflowStart:myWorkflow'),
      'workflow-start-my-workflow'
    )
    assert.equal(
      toSafeKebab('http:options:/rpc/:rpcName'),
      'http-options-rpc-rpc-name'
    )
  })

  test('sanitizes slashes', () => {
    assert.equal(toSafeKebab('http:get:/todos/:id'), 'http-get-todos-id')
  })

  test('collapses consecutive dashes', () => {
    assert.equal(toSafeKebab('a::b'), 'a-b')
    assert.equal(toSafeKebab('a://b'), 'a-b')
  })

  test('strips leading and trailing dashes', () => {
    assert.equal(toSafeKebab(':leadingColon'), 'leading-colon')
    assert.equal(toSafeKebab('/leadingSlash'), 'leading-slash')
  })

  test('handles already kebab-case', () => {
    assert.equal(toSafeKebab('my-function'), 'my-function')
  })

  test('handles graph function IDs', () => {
    assert.equal(
      toSafeKebab('graphStart:todoReviewWorkflow:fetchOverdue'),
      'graph-start-todo-review-workflow-fetch-overdue'
    )
  })
})
