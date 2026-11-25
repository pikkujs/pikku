import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type {
  CoreSingletonServices,
  CoreServices,
  CreateWireServices,
} from './core.types.js'

interface Singletons extends CoreSingletonServices {
  kysely: { driver: string }
}
interface Services extends CoreServices<Singletons> {
  requestScope: { id: string }
}

type Built = Awaited<ReturnType<CreateWireServices<Singletons, Services>>>

describe('CreateWireServices', () => {
  test('returns exactly the keys Services adds to the singleton services', () => {
    const built: Built = { requestScope: { id: 'r1' } }
    // @ts-expect-error a wire service is required
    const missing: Built = {}
    const shadowed: Built = {
      requestScope: { id: 'r1' },
      // @ts-expect-error a singleton key is not a wire service
      kysely: { driver: 'x' },
    }
    assert.ok(built && missing && shadowed)
  })
})
