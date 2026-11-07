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
  join(scenario, '.pikku/contributors/pikku-dev-contributors.gen.ts')
)

assert.ok(generated.includes('@verifier/contrib-notify/src/notifier.js'))
assert.ok(generated.includes('@verifier/contrib-notify/src/logger-prefix.js'))
assert.ok(
  !generated.includes('@verifier/contrib-bad'),
  'nothing is taken from the remote contract package'
)
assert.ok(
  !generated.includes('blob'),
  'only the contributors listed under local are opted in'
)

const addons = JSON.parse(
  await ingestText(
    store,
    join(scenario, '.pikku/addon/pikku-addons-meta.gen.json')
  )
)
assert.equal(addons.cloud.package, '@verifier/contrib-bad')
assert.equal(addons.cloud.remote, true)
console.log(
  '✓ one remote name carries its contract and the contributors of a local package'
)
