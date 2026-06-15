import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { serializeServicesMap } from './pikku-command-services.js'

const SERVICES_IMPORT =
  "import type { SingletonServices } from './application-types.js'"
const WIRE_IMPORT = "import type { Services } from './application-types.js'"

describe('serializeServicesMap', () => {
  test('leaves auth optional when no auth factory is present', () => {
    const content = serializeServicesMap(
      ['auth', 'todoStore'],
      [],
      new Set(['todoStore']),
      [],
      SERVICES_IMPORT,
      WIRE_IMPORT,
      [],
      false
    )

    assert.match(content, /'auth': false,/)
    assert.doesNotMatch(content, /Pick<SingletonServices,[^>]*'auth'/)
  })

  test('marks auth required when an auth factory is injected', () => {
    const content = serializeServicesMap(
      ['auth', 'todoStore'],
      [],
      new Set(['todoStore']),
      [],
      SERVICES_IMPORT,
      WIRE_IMPORT,
      [],
      true
    )

    assert.match(content, /'auth': true,/)
    assert.match(content, /Pick<SingletonServices,[^>]*'auth'/)
  })
})
