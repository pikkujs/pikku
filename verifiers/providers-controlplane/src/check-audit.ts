import assert from 'node:assert/strict'
import { ProviderRegistry, runProviders } from '@pikku/core/provider'
import { auditLog, events } from './providers.js'

const meta = (
  needs: string[],
  optional: string[],
  provides: string[],
  optionalProvides: string[]
) => ({
  needs,
  optional,
  provides,
  optionalProvides,
})

const build = async (services: Record<string, unknown>) => {
  const registry = new ProviderRegistry()
  registry.add(
    'auditLog',
    auditLog,
    { common: meta(['logger'], ['audit'], ['auditLog'], ['auditLog']) },
    { kind: 'wire' }
  )
  registry.add(
    'events',
    events,
    { common: meta([], ['auditLog'], ['events'], []) },
    { kind: 'wire' }
  )
  return runProviders(registry, { target: 'dev', services, env: {} })
}

const logger = { info() {} }
const withAudit = await build({ logger, audit: {} })
assert.ok(
  (withAudit as any).services?.events?.audited,
  'events sees auditLog when audit exists'
)
const without = await build({ logger })
assert.equal((without as any).services?.auditLog, undefined)
assert.equal((without as any).services?.events?.audited, false)
console.log('ok: auditLog is absent without audit and events is still built')
