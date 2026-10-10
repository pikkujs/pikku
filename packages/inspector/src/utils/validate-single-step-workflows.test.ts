import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { ErrorCode } from '../error-codes.js'
import { validateSingleStepWorkflows } from './validate-single-step-workflows.js'

const run = (
  graphs: Record<string, { source: string; nodes: Record<string, object> }>,
  files: Record<string, string> = Object.fromEntries(
    Object.keys(graphs).map((name) => [name, `src/${name}.workflow.ts`])
  )
) => {
  const diagnostics: Array<{
    severity: string
    code: string
    message: string
  }> = []
  const logger = { diagnostic: (d: any) => diagnostics.push(d) } as any
  const state = {
    workflows: {
      graphMeta: Object.fromEntries(
        Object.entries(graphs).map(([name, g]) => [
          name,
          { ...g, pikkuFuncId: name },
        ])
      ),
      files: new Map(
        Object.entries(files).map(([id, path]) => [
          id,
          { path, exportedName: id },
        ])
      ),
      graphFiles: new Map(),
    },
  } as any
  validateSingleStepWorkflows(logger, state)
  return diagnostics.filter((d) => d.code === ErrorCode.SINGLE_STEP_WORKFLOW)
}

describe('validateSingleStepWorkflows', () => {
  test('warns about a workflow with one RPC step and nothing durable', () => {
    const found = run({
      sendWelcome: {
        source: 'dsl',
        nodes: { a: { rpcName: 'sendEmail' }, r: { flow: 'return' } },
      },
    })
    assert.equal(found.length, 1)
    assert.equal(found[0]!.severity, 'warn')
    assert.match(found[0]!.message, /sendWelcome/)
    assert.match(found[0]!.message, /src\/sendWelcome\.workflow\.ts/)
  })

  test('two RPC steps, or one with a sleep, earn the name', () => {
    assert.equal(
      run({
        two: {
          source: 'dsl',
          nodes: { a: { rpcName: 'x' }, b: { rpcName: 'y' } },
        },
        waits: {
          source: 'dsl',
          nodes: { a: { rpcName: 'x' }, s: { flow: 'sleep' } },
        },
      }).length,
      0
    )
  })

  test('scenarios and workflows with no project source file are skipped', () => {
    assert.equal(
      run(
        {
          journey: { source: 'scenario', nodes: { a: { rpcName: 'x' } } },
          fromAddon: { source: 'dsl', nodes: { a: { rpcName: 'x' } } },
        },
        { journey: 'src/journey.scenario.ts' }
      ).length,
      0
    )
  })
})
