import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { renderKnowledgeReconcile } from './render.js'
import type { KnowledgeReconcileResult } from '@pikku/knowledge'

const silence = () => {
  const lines: string[] = []
  const original = console.log
  console.log = (...args: unknown[]) => void lines.push(args.join(' '))
  return { lines, restore: () => void (console.log = original) }
}

describe('what the next action does to the exit code', () => {
  let captured: ReturnType<typeof silence>

  beforeEach(() => {
    captured = silence()
    process.exitCode = 0
  })

  afterEach(() => {
    captured.restore()
    process.exitCode = 0
  })

  const render = (result: Partial<KnowledgeReconcileResult>) =>
    renderKnowledgeReconcile(null, {
      kind: 'dispatch',
      reason: 'ready to build',
      ...result,
    } as KnowledgeReconcileResult)

  test('an unasked-for action leaves the exit code alone, so `next` stays a prompt', () => {
    render({})
    assert.equal(process.exitCode, 0)
  })

  test('an action the caller asked for passes', () => {
    render({ required: ['dispatch', 'idle'], satisfied: true })
    assert.equal(process.exitCode, 0)
  })

  test('an action the caller did not ask for fails, which is what makes this a gate', () => {
    render({ required: ['idle'], satisfied: false })
    assert.equal(process.exitCode, 1)
  })

  test('the refusal names what was found and what was wanted', () => {
    render({ required: ['idle'], satisfied: false })
    const refusal = captured.lines.find((line) => line.includes('dispatch'))
    assert.ok(refusal, 'the refusal never said what the next action was')
    assert.match(refusal!, /requires idle/)
  })

  test('idle satisfying an idle gate is the built milestone passing', () => {
    render({ kind: 'idle', required: ['idle'], satisfied: true })
    assert.equal(process.exitCode, 0)
  })
})
