import assert from 'node:assert/strict'
import { createPlatformServices } from '../.pikku/providers/pikku-dev-providers.gen.js'
import { pikkuState } from '@pikku/core/state'

const logger = { info() {}, error() {} }
const singletons = await createPlatformServices({}, { logger })
const create = pikkuState(null, 'package', 'wireProviders')
assert.ok(create, 'the runner registers the per-request providers')

const first = await create(singletons, { session: { id: 1 } } as never, {
  needs: ['events', 'maybe'],
})
assert.deepEqual(Object.keys(first.services).sort(), [
  'events',
  'maybe',
  'requestScope',
])
assert.equal((first.services.events as any).audited, false)
assert.equal(
  (first.services.requestScope as any).session.id,
  1,
  'a provider gets the invocation wire'
)
const second = await create(singletons, { session: { id: 2 } } as never, {
  needs: ['events'],
})
assert.notEqual(first.services.requestScope, second.services.requestScope)
assert.ok(
  !('neverBuilt' in first.services),
  'an unreached provider is not built'
)
assert.ok(
  !('maybe' in second.services),
  'a provider the function does not reach is not built'
)
const audited = await create(singletons, {} as never, {
  needs: ['events'],
  held: { auditLog: {} },
})
assert.equal((audited.services.events as any).audited, true)
await first.stop()
console.log('ok: wire providers build per invocation from the generated runner')
