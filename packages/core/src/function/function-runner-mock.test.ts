import { describe, test, beforeEach } from 'node:test'
import * as assert from 'node:assert'
import { addFunction, runPikkuFunc } from './function-runner.js'
import { resetPikkuState, pikkuState } from '../pikku-state.js'
import type { CoreServices } from '../types/core.types.js'
import { NotImplementedError } from '../errors/errors.js'

const singletonServices = {
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
} as any

const services: CoreServices = { ...singletonServices } as any

describe('runPikkuFunc - mock functions', () => {
  beforeEach(() => {
    resetPikkuState()
  })

  test('a function declared mock: true is refused with a clear error when called', async () => {
    addFunction('notYetBuilt', { mock: true } as any)
    pikkuState(null, 'function', 'meta').notYetBuilt = {
      pikkuFuncId: 'notYetBuilt',
      inputSchemaName: null,
      outputSchemaName: null,
      sessionless: true,
    }

    await assert.rejects(
      runPikkuFunc('rpc', Math.random().toString(), 'notYetBuilt', {
        singletonServices,
        getAllServices: () => services,
        data: () => ({}),
        auth: false,
        wire: {},
      }),
      (error: unknown) =>
        error instanceof NotImplementedError &&
        error.message ===
          "Function 'notYetBuilt' is mocked: it has no implementation yet"
    )
  })
})
