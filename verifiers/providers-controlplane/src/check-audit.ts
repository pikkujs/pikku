import assert from 'node:assert/strict'
import { ProviderRegistry, WireProviders } from '@pikku/core/provider'
import { events } from './providers.js'

// Core builds auditLog for an invocation whose function has an audit config and
// hands it to the per-request providers; `events` reads it as optional.
const registry = new ProviderRegistry().add(
  'events',
  events,
  {
    common: {
      needs: ['auditLog'],
      optional: ['auditLog'],
      provides: ['events'],
      optionalProvides: [],
    },
  },
  { kind: 'wire' }
)
const wireProviders = new WireProviders(registry, { target: 'dev' })

const flushed: string[] = []
const logger = { info() {}, error() {} }
const auditLog = { write() {}, flush: async () => flushed.push('flush') }

const withAudit = await wireProviders.run({ logger }, {} as never, {
  held: { auditLog },
})
assert.equal(
  (withAudit.services.events as { audited: boolean }).audited,
  true,
  'events sees auditLog when core built one'
)
const without = await wireProviders.run({ logger }, {} as never)
assert.equal('auditLog' in without.services, false)
assert.equal(
  (without.services.events as { audited: boolean }).audited,
  false,
  'events is still built without auditLog'
)
console.log(
  'ok: auditLog is core-owned, and events is built with or without it'
)
