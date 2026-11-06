import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const scenario = resolve(here, '../scenarios/remote-local')
const read = (engine: string) =>
  readFileSync(
    join(
      scenario,
      `.pikku-${engine}/contributors/pikku-dev-contributors.gen.ts`
    ),
    'utf8'
  )

const native = read('native')
const typescript = read('typescript')
assert.equal(native, typescript, 'both inspector engines agree')
assert.ok(native.includes('@verifier/contrib-notify/src/notifier.js'))
assert.ok(native.includes('@verifier/contrib-notify/src/logger-prefix.js'))
assert.ok(
  !native.includes('@verifier/contrib-bad'),
  'nothing is taken from the remote contract package'
)
assert.ok(
  !native.includes('blob'),
  'only the contributors listed under local are opted in'
)

const addons = JSON.parse(
  readFileSync(
    join(scenario, '.pikku-native/addon/pikku-addons-meta.gen.json'),
    'utf8'
  )
)
assert.equal(addons.cloud.package, '@verifier/contrib-bad')
assert.equal(addons.cloud.remote, true)
console.log(
  '✓ one remote name carries its contract and the contributors of a local package'
)
