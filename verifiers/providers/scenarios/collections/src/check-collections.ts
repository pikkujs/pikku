import assert from 'node:assert/strict'
import { pikkuState } from '@pikku/core/state'
import { stopSingletonServices } from '@pikku/core/lifecycle'
import { createPlatformServices } from '../.pikku/providers/pikku-dev-providers.gen.js'

const services = await createPlatformServices({})

assert.deepEqual(
  (services.things as { label: string }[]).map((entry) => entry.label),
  ['one', 'two'],
  'the collection holds one entry per contributor, sorted by label'
)
assert.deepEqual(services.reader, { labels: ['one', 'two'] })
assert.throws(
  () => (services.things as unknown[]).push({}),
  TypeError,
  'the collection is frozen'
)

const quiet = { info() {}, warn() {}, error() {}, debug() {} }
pikkuState(null, 'package', 'singletonServices', {
  ...services,
  logger: quiet,
} as never)
await stopSingletonServices()
console.log('collections ok')
