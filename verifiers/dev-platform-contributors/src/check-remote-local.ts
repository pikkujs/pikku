import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const scenario = resolve(here, '../scenarios/remote-local')
const generated = readFileSync(
  join(scenario, '.pikku/contributors/pikku-dev-contributors.gen.ts'),
  'utf8'
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
  readFileSync(
    join(scenario, '.pikku/addon/pikku-addons-meta.gen.json'),
    'utf8'
  )
)
assert.equal(addons.cloud.package, '@verifier/contrib-bad')
assert.equal(addons.cloud.remote, true)
console.log(
  '✓ one remote name carries its contract and the contributors of a local package'
)
