import assert from 'node:assert/strict'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createScriptContent, ingestText } from './script-content.js'

const here = dirname(fileURLToPath(import.meta.url))
const scenario = resolve(here, '../scenarios/remote-local')
const store = createScriptContent(
  resolve(here, '../.pikku-runtime/script-content')
)
const generated = await ingestText(
  store,
  join(scenario, '.pikku/services/pikku-dev-services.gen.ts')
)

assert.ok(generated.includes('@verifier/svc-notify/src/notifier.js'))
assert.ok(generated.includes('@verifier/svc-notify/src/logger-prefix.js'))
assert.ok(
  !generated.includes('@verifier/svc-bad'),
  'nothing is taken from the remote contract package'
)
assert.ok(
  !generated.includes('blob'),
  'only the services listed under local are opted in'
)

const addons = JSON.parse(
  await ingestText(
    store,
    join(scenario, '.pikku/addon/pikku-addons-meta.gen.json')
  )
)
assert.equal(addons.cloud.package, '@verifier/svc-bad')
assert.equal(addons.cloud.remote, true)
console.log(
  '✓ one remote name carries its contract and the services of a local package'
)
