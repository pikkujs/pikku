import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

import {
  InMemoryAttentionResultStore,
  addAttentionFunc,
  pikkuAttentionFunc,
} from '@pikku/core/attention-func'
import { pikkuState } from '@pikku/core/state'

import { getAttention } from './get-attention.function.js'
import { refreshAttention } from './refresh-attention.function.js'

const widget = 'health.verdict'
let attentionResults: InMemoryAttentionResultStore
let started: string[]

beforeEach(() => {
  attentionResults = new InMemoryAttentionResultStore()
  started = []
  pikkuState(null, 'attention', 'funcs').clear()
  pikkuState(null, 'attention', 'meta')[widget] = {
    widget,
    every: '1m',
    schedule: '*/1 * * * *',
  }
  addAttentionFunc(
    widget,
    pikkuAttentionFunc({ widget, every: '1m', func: async () => undefined })
  )
})

test('a widget that has never run reads as null', async () => {
  assert.equal(
    await getAttention.func(
      { attentionResults } as never,
      { projectKey: 'p1', widget } as never,
      {} as never
    ),
    null
  )
})

test('a refresh starts the widget workflow for the project and reads what it stored', async () => {
  const workflowService = {
    startWorkflow: async (name: string, input: { projectKey: string }) => {
      started.push(name)
      await attentionResults.put({
        projectKey: input.projectKey,
        widget,
        status: 'quiet',
        updatedAt: new Date(),
      })
      return { runId: 'r1' }
    },
  }
  const result = await refreshAttention.func(
    { attentionResults, workflowService } as never,
    { projectKey: 'p1', widget } as never,
    { rpc: {} } as never
  )
  assert.deepEqual(started, ['attention.health.verdict'])
  assert.equal(result?.status, 'quiet')
  assert.equal(
    (
      await getAttention.func(
        { attentionResults } as never,
        { projectKey: 'p1', widget } as never,
        {} as never
      )
    )?.status,
    'quiet'
  )
})

test('a widget with no attention func is refused', async () => {
  await assert.rejects(
    getAttention.func(
      { attentionResults } as never,
      { projectKey: 'p1', widget: 'nope.nope' } as never,
      {} as never
    ),
    /No attention func is registered/
  )
})
