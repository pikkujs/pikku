import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { serializeFunctionTypes } from './serialize-function-types.js'

describe('serializeFunctionTypes', () => {
  test('emits pikkuListFunc without a named list-function type', () => {
    const content = serializeFunctionTypes(
      "import type { Session } from './session.js'",
      'Session',
      "import type { SingletonServices } from './singleton-services.js'",
      'SingletonServices',
      "import type { Services } from './wire-services.js'",
      'Services',
      "import type { FlattenedRPCMap, TypedPikkuRPC } from './rpc-map.js'",
      "import type { RequiredSingletonServices, RequiredWireServices } from './required-services.js'",
      "import type { Config } from './config.js'"
    )

    assert.match(content, /ListInput, ListOutput/)
    assert.doesNotMatch(content, /PikkuListFunction/)
    assert.match(content, /export const pikkuListFunc = </)
    assert.match(
      content,
      /PikkuFunctionConfig<\s*ListInput<F, S>,\s*ListOutput<Row>/
    )
  })
})
