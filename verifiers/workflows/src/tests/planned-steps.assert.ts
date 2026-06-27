/**
 * Verifies the static UI plan the inspector bakes into workflow meta.
 *
 * A predictable (loopless) DSL workflow ships `plannedSteps` (every named step
 * in source order) + `deterministic`, so a frontend can render the run skeleton
 * before execution. This asserts the gating invariants across the whole
 * generated corpus plus a few named anchors. Run after `pikku` codegen.
 */

import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { SerializedWorkflowGraph } from '@pikku/inspector'

const META_DIR = join(import.meta.dirname!, '../../.pikku/workflow/meta')

async function loadCorpus(): Promise<SerializedWorkflowGraph[]> {
  const files = (await readdir(META_DIR)).filter((f) => f.endsWith('.gen.json'))
  return Promise.all(
    files.map(async (f) =>
      JSON.parse(await readFile(join(META_DIR, f), 'utf-8'))
    )
  )
}

function byName(
  corpus: SerializedWorkflowGraph[],
  name: string
): SerializedWorkflowGraph {
  const wf = corpus.find((w) => w.name === name)
  assert.ok(wf, `expected generated meta for workflow "${name}"`)
  return wf
}

describe('workflow meta — static plannedSteps plan', async () => {
  const corpus = await loadCorpus()

  test('only DSL workflows carry a plan (never complex/graph)', () => {
    for (const wf of corpus) {
      if (wf.source !== 'dsl') {
        assert.equal(
          wf.plannedSteps,
          undefined,
          `${wf.name} (${wf.source}) must not have plannedSteps`
        )
        assert.equal(
          wf.deterministic,
          undefined,
          `${wf.name} (${wf.source}) must not have deterministic`
        )
      }
    }
  })

  test('every DSL workflow has a deterministic flag', () => {
    for (const wf of corpus) {
      if (wf.source === 'dsl') {
        assert.equal(
          typeof wf.deterministic,
          'boolean',
          `${wf.name} missing deterministic`
        )
      }
    }
  })

  test('plannedSteps, when present, are named and non-empty', () => {
    // An empty array is never emitted: a deterministic workflow with no named
    // steps (e.g. a bare return) simply omits plannedSteps.
    for (const wf of corpus) {
      if (wf.plannedSteps !== undefined) {
        assert.ok(
          wf.plannedSteps.length > 0,
          `${wf.name} has an empty plannedSteps array (should be omitted)`
        )
        for (const step of wf.plannedSteps) {
          assert.ok(
            typeof step.stepName === 'string' && step.stepName.length > 0,
            `${wf.name} has an unnamed planned step`
          )
        }
      }
    }
  })

  test('a loopless linear workflow is deterministic with steps in order', () => {
    const wf = byName(corpus, 'taskCrudWorkflow')
    assert.equal(wf.source, 'dsl')
    assert.equal(wf.deterministic, true)
    assert.deepEqual(
      wf.plannedSteps?.map((s) => s.stepName),
      [
        'Create task',
        'Get task',
        'Update task status',
        'Mark task completed',
        'Delete task',
      ]
    )
  })

  test('a branchy loopless workflow lists all arms but is not deterministic', () => {
    const wf = byName(corpus, 'autoRestockWorkflow')
    assert.equal(wf.source, 'dsl')
    assert.equal(wf.deterministic, false)
    assert.ok(
      wf.plannedSteps && wf.plannedSteps.length > 0,
      'branchy workflow still lists its possible steps'
    )
  })
})
