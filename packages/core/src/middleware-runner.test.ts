import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert'
import {
  combineMiddleware,
  addMiddleware,
  runMiddleware,
} from './middleware-runner.js'
import { resetPikkuState } from './pikku-state.js'
import { CorePikkuMiddleware, PikkuWiringTypes } from './types/core.types.js'

beforeEach(() => {
  resetPikkuState()
})

describe('combineMiddleware', () => {
  test('should return empty array when no parameters provided', () => {
    const result = combineMiddleware(
      PikkuWiringTypes.http,
      Math.random().toString()
    )
    assert.deepEqual(result, [])
  })

  test('should return empty array when all parameters are undefined', () => {
    const result = combineMiddleware(
      PikkuWiringTypes.http,
      Math.random().toString(),
      {
        wiringMiddleware: undefined,
        wiringTags: undefined,
        funcMiddleware: undefined,
        funcTags: undefined,
      }
    )
    assert.deepEqual(result, [])
  })

  test('should combine wiring middleware only', () => {
    const mockMiddleware1: CorePikkuMiddleware = async (
      services,
      interaction,
      next
    ) => {
      await next()
    }
    const mockMiddleware2: CorePikkuMiddleware = async (
      services,
      interaction,
      next
    ) => {
      await next()
    }

    const result = combineMiddleware(
      PikkuWiringTypes.http,
      Math.random().toString(),
      {
        wireMiddleware: [mockMiddleware1, mockMiddleware2],
      }
    )

    assert.equal(result.length, 2)
    assert.equal(result[0], mockMiddleware1)
    assert.equal(result[1], mockMiddleware2)
  })

  test('should combine function middleware only', () => {
    const mockMiddleware1: CorePikkuMiddleware = async (
      services,
      interaction,
      next
    ) => {
      await next()
    }
    const mockMiddleware2: CorePikkuMiddleware = async (
      services,
      interaction,
      next
    ) => {
      await next()
    }

    const result = combineMiddleware(
      PikkuWiringTypes.http,
      Math.random().toString(),
      {
        funcMiddleware: [mockMiddleware1, mockMiddleware2],
      }
    )

    assert.equal(result.length, 2)
    assert.equal(result[0], mockMiddleware1)
    assert.equal(result[1], mockMiddleware2)
  })

  test('should execute middleware in correct order: wireInheritedMiddleware (tags) → wireMiddleware → funcInheritedMiddleware (tags) → funcMiddleware', () => {
    // Setup tagged middleware
    const wiringTagMiddleware: CorePikkuMiddleware = async (
      services,
      interaction,
      next
    ) => {
      await next()
    }
    const funcTagMiddleware: CorePikkuMiddleware = async (
      services,
      interaction,
      next
    ) => {
      await next()
    }

    addMiddleware('wiringTag', [wiringTagMiddleware])
    addMiddleware('funcTag', [funcTagMiddleware])

    const wiringMiddleware: CorePikkuMiddleware = async (
      services,
      interaction,
      next
    ) => {
      await next()
    }
    const funcMiddleware: CorePikkuMiddleware = async (
      services,
      interaction,
      next
    ) => {
      await next()
    }

    const result = combineMiddleware(
      PikkuWiringTypes.http,
      Math.random().toString(),
      {
        wireInheritedMiddleware: [{ type: 'tag', tag: 'wiringTag' }],
        wireMiddleware: [wiringMiddleware],
        funcInheritedMiddleware: [{ type: 'tag', tag: 'funcTag' }],
        funcMiddleware: [funcMiddleware],
      }
    )

    assert.equal(result.length, 4)
    // Order: wireInheritedMiddleware (tags), wireMiddleware, funcInheritedMiddleware (tags), funcMiddleware
    assert.equal(result[0], wiringTagMiddleware) // wireInheritedMiddleware tags first
    assert.equal(result[1], wiringMiddleware) // wireMiddleware second
    assert.equal(result[2], funcTagMiddleware) // funcInheritedMiddleware tags third
    assert.equal(result[3], funcMiddleware) // funcMiddleware last
  })

  test('should handle wiring tags only', () => {
    const taggedMiddleware: CorePikkuMiddleware = async (
      services,
      interaction,
      next
    ) => {
      await next()
    }

    addMiddleware('testTag', [taggedMiddleware])

    const result = combineMiddleware(
      PikkuWiringTypes.http,
      Math.random().toString(),
      {
        wireInheritedMiddleware: [{ type: 'tag', tag: 'testTag' }],
      }
    )

    assert.equal(result.length, 1)
    assert.equal(result[0], taggedMiddleware)
  })

  test('should handle function tags only', () => {
    const taggedMiddleware: CorePikkuMiddleware = async (
      services,
      interaction,
      next
    ) => {
      await next()
    }

    addMiddleware('funcTestTag', [taggedMiddleware])

    const result = combineMiddleware(
      PikkuWiringTypes.http,
      Math.random().toString(),
      {
        funcInheritedMiddleware: [{ type: 'tag', tag: 'funcTestTag' }],
      }
    )

    assert.equal(result.length, 1)
    assert.equal(result[0], taggedMiddleware)
  })

  test('should handle multiple tags', () => {
    const middleware1: CorePikkuMiddleware = async (
      services,
      interaction,
      next
    ) => {
      await next()
    }
    const middleware2: CorePikkuMiddleware = async (
      services,
      interaction,
      next
    ) => {
      await next()
    }

    addMiddleware('tag1', [middleware1])
    addMiddleware('tag2', [middleware2])

    const result = combineMiddleware(
      PikkuWiringTypes.http,
      Math.random().toString(),
      {
        wireInheritedMiddleware: [
          { type: 'tag', tag: 'tag1' },
          { type: 'tag', tag: 'tag2' },
        ],
      }
    )

    assert.equal(result.length, 2)
    assert.equal(result[0], middleware1)
    assert.equal(result[1], middleware2)
  })

  test('should ignore non-existent tags', () => {
    const middleware: CorePikkuMiddleware = async (
      services,
      interaction,
      next
    ) => {
      await next()
    }

    addMiddleware('existingTag', [middleware])

    const result = combineMiddleware(
      PikkuWiringTypes.http,
      Math.random().toString(),
      {
        wireInheritedMiddleware: [
          { type: 'tag', tag: 'existingTag' },
          { type: 'tag', tag: 'nonExistentTag' },
        ],
        funcInheritedMiddleware: [
          { type: 'tag', tag: 'anotherNonExistentTag' },
        ],
      }
    )

    assert.equal(result.length, 1)
    assert.equal(result[0], middleware)
  })
})

describe('runMiddleware', () => {
  test('should deduplicate middleware using Set', async () => {
    const executionOrder: string[] = []

    const middleware1: CorePikkuMiddleware = async (
      services,
      interaction,
      next
    ) => {
      executionOrder.push('middleware1')
      await next()
    }

    const middleware2: CorePikkuMiddleware = async (
      services,
      interaction,
      next
    ) => {
      executionOrder.push('middleware2')
      await next()
    }

    await runMiddleware(
      {} as any,
      {} as any,
      combineMiddleware(PikkuWiringTypes.rpc, Math.random().toString(), {
        wireMiddleware: [middleware1, middleware2, middleware1, middleware2],
      }),
      async () => {
        executionOrder.push('main')
      }
    )

    // Should only execute each middleware once
    assert.deepEqual(executionOrder, ['middleware1', 'middleware2', 'main'])
  })

  test('should execute middleware in correct order', async () => {
    const executionOrder: string[] = []

    const middleware1: CorePikkuMiddleware = async (
      services,
      interaction,
      next
    ) => {
      executionOrder.push('start1')
      await next()
      executionOrder.push('end1')
    }

    const middleware2: CorePikkuMiddleware = async (
      services,
      interaction,
      next
    ) => {
      executionOrder.push('start2')
      await next()
      executionOrder.push('end2')
    }

    await runMiddleware(
      {} as any,
      {} as any,
      [middleware1, middleware2],
      async () => {
        executionOrder.push('main')
      }
    )

    assert.deepEqual(executionOrder, [
      'start1',
      'start2',
      'main',
      'end2',
      'end1',
    ])
  })

  test('should work with empty middleware array', async () => {
    let mainExecuted = false

    await runMiddleware({} as any, {} as any, [], async () => {
      mainExecuted = true
    })

    assert.equal(mainExecuted, true)
  })

  test('should work without main function', async () => {
    const executionOrder: string[] = []

    const middleware: CorePikkuMiddleware = async (
      services,
      interaction,
      next
    ) => {
      executionOrder.push('middleware')
      await next()
    }

    await runMiddleware({} as any, {} as any, [middleware])

    assert.deepEqual(executionOrder, ['middleware'])
  })
})
