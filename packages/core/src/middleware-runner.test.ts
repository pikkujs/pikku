import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert'
import {
  combineMiddleware,
  addMiddleware,
  runMiddleware,
} from './middleware-runner.js'
import { resetPikkuState } from './pikku-state.js'
import type {
  CorePikkuMiddleware,
  MiddlewarePriority,
} from './types/core.types.js'
import { pikkuMiddleware } from './types/core.types.js'

const withPriority = (
  name: string,
  priority: MiddlewarePriority,
  log: string[]
): CorePikkuMiddleware => {
  return pikkuMiddleware({
    name,
    priority,
    func: async (_services, _wire, next) => {
      log.push(`start:${name}`)
      await next()
      log.push(`end:${name}`)
    },
  })
}

beforeEach(() => {
  resetPikkuState()
})

describe('combineMiddleware', () => {
  test('should return empty array when no parameters provided', () => {
    const result = combineMiddleware('http', Math.random().toString())
    assert.deepEqual(result, [])
  })

  test('should return empty array when all parameters are undefined', () => {
    const result = combineMiddleware('http', Math.random().toString(), {
      wiringMiddleware: undefined,
      wiringTags: undefined,
      funcMiddleware: undefined,
      funcTags: undefined,
    })
    assert.deepEqual(result, [])
  })

  test('should combine wiring middleware only', () => {
    const mockMiddleware1: CorePikkuMiddleware = async (
      services,
      wire,
      next
    ) => {
      await next()
    }
    const mockMiddleware2: CorePikkuMiddleware = async (
      services,
      wire,
      next
    ) => {
      await next()
    }

    const result = combineMiddleware('http', Math.random().toString(), {
      wireMiddleware: [mockMiddleware1, mockMiddleware2],
    })

    assert.equal(result.length, 2)
    assert.equal(result[0], mockMiddleware1)
    assert.equal(result[1], mockMiddleware2)
  })

  test('should combine function middleware only', () => {
    const mockMiddleware1: CorePikkuMiddleware = async (
      services,
      wire,
      next
    ) => {
      await next()
    }
    const mockMiddleware2: CorePikkuMiddleware = async (
      services,
      wire,
      next
    ) => {
      await next()
    }

    const result = combineMiddleware('http', Math.random().toString(), {
      funcMiddleware: [mockMiddleware1, mockMiddleware2],
    })

    assert.equal(result.length, 2)
    assert.equal(result[0], mockMiddleware1)
    assert.equal(result[1], mockMiddleware2)
  })

  test('should execute middleware in correct order: wireInheritedMiddleware (tags) → wireMiddleware → funcInheritedMiddleware (tags) → funcMiddleware', () => {
    // Setup tagged middleware
    const wiringTagMiddleware: CorePikkuMiddleware = async (
      services,
      wire,
      next
    ) => {
      await next()
    }
    const funcTagMiddleware: CorePikkuMiddleware = async (
      services,
      wire,
      next
    ) => {
      await next()
    }

    addMiddleware('wiringTag', [wiringTagMiddleware])
    addMiddleware('funcTag', [funcTagMiddleware])

    const wiringMiddleware: CorePikkuMiddleware = async (
      services,
      wire,
      next
    ) => {
      await next()
    }
    const funcMiddleware: CorePikkuMiddleware = async (
      services,
      wire,
      next
    ) => {
      await next()
    }

    const result = combineMiddleware('http', Math.random().toString(), {
      wireInheritedMiddleware: [{ type: 'tag', tag: 'wiringTag' }],
      wireMiddleware: [wiringMiddleware],
      funcInheritedMiddleware: [{ type: 'tag', tag: 'funcTag' }],
      funcMiddleware: [funcMiddleware],
    })

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
      wire,
      next
    ) => {
      await next()
    }

    addMiddleware('testTag', [taggedMiddleware])

    const result = combineMiddleware('http', Math.random().toString(), {
      wireInheritedMiddleware: [{ type: 'tag', tag: 'testTag' }],
    })

    assert.equal(result.length, 1)
    assert.equal(result[0], taggedMiddleware)
  })

  test('should handle function tags only', () => {
    const taggedMiddleware: CorePikkuMiddleware = async (
      services,
      wire,
      next
    ) => {
      await next()
    }

    addMiddleware('funcTestTag', [taggedMiddleware])

    const result = combineMiddleware('http', Math.random().toString(), {
      funcInheritedMiddleware: [{ type: 'tag', tag: 'funcTestTag' }],
    })

    assert.equal(result.length, 1)
    assert.equal(result[0], taggedMiddleware)
  })

  test('should handle multiple tags', () => {
    const middleware1: CorePikkuMiddleware = async (services, wire, next) => {
      await next()
    }
    const middleware2: CorePikkuMiddleware = async (services, wire, next) => {
      await next()
    }

    addMiddleware('tag1', [middleware1])
    addMiddleware('tag2', [middleware2])

    const result = combineMiddleware('http', Math.random().toString(), {
      wireInheritedMiddleware: [
        { type: 'tag', tag: 'tag1' },
        { type: 'tag', tag: 'tag2' },
      ],
    })

    assert.equal(result.length, 2)
    assert.equal(result[0], middleware1)
    assert.equal(result[1], middleware2)
  })

  test('should apply parent tag middleware to namespaced tag', () => {
    const billingMiddleware: CorePikkuMiddleware = async (
      services,
      wire,
      next
    ) => {
      await next()
    }

    addMiddleware('billing', [billingMiddleware])

    const result = combineMiddleware('http', Math.random().toString(), {
      wireInheritedMiddleware: [{ type: 'tag', tag: 'billing:read' }],
    })

    assert.equal(result.length, 1)
    assert.equal(result[0], billingMiddleware)
  })

  test('should apply exact tag middleware for non-namespaced tag', () => {
    const billingMiddleware: CorePikkuMiddleware = async (
      services,
      wire,
      next
    ) => {
      await next()
    }

    addMiddleware('billing', [billingMiddleware])

    const result = combineMiddleware('http', Math.random().toString(), {
      wireInheritedMiddleware: [{ type: 'tag', tag: 'billing' }],
    })

    assert.equal(result.length, 1)
    assert.equal(result[0], billingMiddleware)
  })

  test('should apply both exact and parent tag middleware (specific first)', () => {
    const billingMiddleware: CorePikkuMiddleware = async (
      services,
      wire,
      next
    ) => {
      await next()
    }
    const billingReadMiddleware: CorePikkuMiddleware = async (
      services,
      wire,
      next
    ) => {
      await next()
    }

    addMiddleware('billing', [billingMiddleware])
    addMiddleware('billing:read', [billingReadMiddleware])

    const result = combineMiddleware('http', Math.random().toString(), {
      wireInheritedMiddleware: [{ type: 'tag', tag: 'billing:read' }],
    })

    assert.equal(result.length, 2)
    assert.equal(result[0], billingReadMiddleware)
    assert.equal(result[1], billingMiddleware)
  })

  test('should resolve multi-level namespace tags', () => {
    const billingMiddleware: CorePikkuMiddleware = async (
      services,
      wire,
      next
    ) => {
      await next()
    }
    const billingReadMiddleware: CorePikkuMiddleware = async (
      services,
      wire,
      next
    ) => {
      await next()
    }
    const billingReadAdminMiddleware: CorePikkuMiddleware = async (
      services,
      wire,
      next
    ) => {
      await next()
    }

    addMiddleware('billing', [billingMiddleware])
    addMiddleware('billing:read', [billingReadMiddleware])
    addMiddleware('billing:read:admin', [billingReadAdminMiddleware])

    const result = combineMiddleware('http', Math.random().toString(), {
      wireInheritedMiddleware: [{ type: 'tag', tag: 'billing:read:admin' }],
    })

    assert.equal(result.length, 3)
    assert.equal(result[0], billingReadAdminMiddleware)
    assert.equal(result[1], billingReadMiddleware)
    assert.equal(result[2], billingMiddleware)
  })

  test('should apply parent tag middleware via funcInheritedMiddleware', () => {
    const billingMiddleware: CorePikkuMiddleware = async (
      services,
      wire,
      next
    ) => {
      await next()
    }

    addMiddleware('billing', [billingMiddleware])

    const result = combineMiddleware('http', Math.random().toString(), {
      funcInheritedMiddleware: [{ type: 'tag', tag: 'billing:write' }],
    })

    assert.equal(result.length, 1)
    assert.equal(result[0], billingMiddleware)
  })

  test('should ignore non-existent tags', () => {
    const middleware: CorePikkuMiddleware = async (services, wire, next) => {
      await next()
    }

    addMiddleware('existingTag', [middleware])

    const result = combineMiddleware('http', Math.random().toString(), {
      wireInheritedMiddleware: [
        { type: 'tag', tag: 'existingTag' },
        { type: 'tag', tag: 'nonExistentTag' },
      ],
      funcInheritedMiddleware: [{ type: 'tag', tag: 'anotherNonExistentTag' }],
    })

    assert.equal(result.length, 1)
    assert.equal(result[0], middleware)
  })

  test('should sort middleware by priority', () => {
    const log: string[] = []
    const low = withPriority('low', 'low', log)
    const highest = withPriority('highest', 'highest', log)
    const medium = withPriority('medium', 'medium', log)

    const result = combineMiddleware('http', Math.random().toString(), {
      wireMiddleware: [low, highest, medium],
    })

    assert.equal(result.length, 3)
    assert.equal(result[0], highest)
    assert.equal(result[1], medium)
    assert.equal(result[2], low)
  })

  test('should default unprioritized middleware to medium', () => {
    const log: string[] = []
    const highest = withPriority('highest', 'highest', log)
    const lowest = withPriority('lowest', 'lowest', log)
    const noPriority: CorePikkuMiddleware = async (_services, _wire, next) => {
      await next()
    }

    const result = combineMiddleware('http', Math.random().toString(), {
      wireMiddleware: [lowest, noPriority, highest],
    })

    assert.equal(result.length, 3)
    assert.equal(result[0], highest)
    assert.equal(result[1], noPriority) // defaults to medium
    assert.equal(result[2], lowest)
  })

  test('should preserve registration order within same priority', () => {
    const log: string[] = []
    const first = withPriority('first', 'medium', log)
    const second = withPriority('second', 'medium', log)
    const third = withPriority('third', 'medium', log)

    const result = combineMiddleware('http', Math.random().toString(), {
      wireMiddleware: [first, second, third],
    })

    assert.equal(result.length, 3)
    assert.equal(result[0], first)
    assert.equal(result[1], second)
    assert.equal(result[2], third)
  })
})

describe('runMiddleware', () => {
  test('should deduplicate middleware using Set', async () => {
    const executionOrder: string[] = []

    const middleware1: CorePikkuMiddleware = async (services, wire, next) => {
      executionOrder.push('middleware1')
      await next()
    }

    const middleware2: CorePikkuMiddleware = async (services, wire, next) => {
      executionOrder.push('middleware2')
      await next()
    }

    await runMiddleware(
      {} as any,
      {} as any,
      combineMiddleware('rpc', Math.random().toString(), {
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

    const middleware1: CorePikkuMiddleware = async (services, wire, next) => {
      executionOrder.push('start1')
      await next()
      executionOrder.push('end1')
    }

    const middleware2: CorePikkuMiddleware = async (services, wire, next) => {
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

    const middleware: CorePikkuMiddleware = async (services, wire, next) => {
      executionOrder.push('middleware')
      await next()
    }

    await runMiddleware({} as any, {} as any, [middleware])

    assert.deepEqual(executionOrder, ['middleware'])
  })

  test('should execute middleware in priority order (highest first, lowest last)', async () => {
    const log: string[] = []
    const low = withPriority('low', 'low', log)
    const highest = withPriority('highest', 'highest', log)
    const medium = withPriority('medium', 'medium', log)

    await runMiddleware(
      {} as any,
      {} as any,
      [low, highest, medium],
      async () => {
        log.push('main')
      }
    )

    assert.deepEqual(log, [
      'start:highest',
      'start:medium',
      'start:low',
      'main',
      'end:low',
      'end:medium',
      'end:highest',
    ])
  })

  test('should sort unsorted middleware passed directly to runMiddleware', async () => {
    const log: string[] = []
    const lowest = withPriority('lowest', 'lowest', log)
    const highest = withPriority('highest', 'highest', log)

    await runMiddleware({} as any, {} as any, [lowest, highest], async () => {
      log.push('main')
    })

    // highest should run first (outermost), lowest last (innermost)
    assert.deepEqual(log, [
      'start:highest',
      'start:lowest',
      'main',
      'end:lowest',
      'end:highest',
    ])
  })

  test('should handle all five priority levels in correct order', async () => {
    const log: string[] = []
    const lowest = withPriority('lowest', 'lowest', log)
    const low = withPriority('low', 'low', log)
    const medium = withPriority('medium', 'medium', log)
    const high = withPriority('high', 'high', log)
    const highest = withPriority('highest', 'highest', log)

    // Pass in reverse order to verify sorting
    await runMiddleware(
      {} as any,
      {} as any,
      [lowest, low, medium, high, highest],
      async () => {
        log.push('main')
      }
    )

    assert.deepEqual(log, [
      'start:highest',
      'start:high',
      'start:medium',
      'start:low',
      'start:lowest',
      'main',
      'end:lowest',
      'end:low',
      'end:medium',
      'end:high',
      'end:highest',
    ])
  })
})
