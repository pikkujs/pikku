import { test, describe } from 'node:test'
import { strict as assert } from 'node:assert'
import { computeDiagnostics } from './post-process.js'
import type { InspectorState } from '../types.js'
import { ErrorCode } from '../error-codes.js'

function stateWithFunctions(
  meta: InspectorState['functions']['meta']
): InspectorState {
  return {
    functions: { meta },
    middleware: { definitions: {} },
    permissions: { definitions: {} },
  } as unknown as InspectorState
}

describe('computeDiagnostics', () => {
  test('flags a user-authored function that does not destructure services', () => {
    const state = stateWithFunctions({
      myFunc: {
        pikkuFuncId: 'myFunc',
        inputSchemaName: null,
        outputSchemaName: null,
        sourceFile: '/project/src/my-func.ts',
        services: { optimized: false, services: ['kysely'] },
      },
    })
    computeDiagnostics(state)
    assert.equal(state.diagnostics.length, 1)
    assert.equal(
      state.diagnostics[0].code,
      ErrorCode.SERVICES_NOT_DESTRUCTURED
    )
  })

  test('does NOT flag a generated .gen.ts function (user cannot edit it)', () => {
    const state = stateWithFunctions({
      cliRaw: {
        pikkuFuncId: 'cliRaw',
        inputSchemaName: null,
        outputSchemaName: null,
        sourceFile: '/project/src/wirings/cli-channel.gen.ts',
        services: { optimized: false, services: ['kysely'] },
      },
      authHandler: {
        pikkuFuncId: 'authHandler',
        inputSchemaName: null,
        outputSchemaName: null,
        sourceFile: '/project/.pikku/auth.gen.ts',
        wires: { optimized: false, wires: ['http'] },
      },
    })
    computeDiagnostics(state)
    assert.equal(state.diagnostics.length, 0)
  })

  test('does NOT flag a synthetic route bridge with no source file', () => {
    const state = stateWithFunctions({
      'http:get:/workflow-run/:runId/stream': {
        pikkuFuncId: 'http:get:/workflow-run/:runId/stream',
        inputSchemaName: null,
        outputSchemaName: null,
        services: { optimized: false, services: [] },
      },
    })
    computeDiagnostics(state)
    assert.equal(state.diagnostics.length, 0)
  })
})
