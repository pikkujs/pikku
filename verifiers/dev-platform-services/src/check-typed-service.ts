// `#pikku/provider` is generated for a project, not for an addon, and at runtime
// it is only core's helper: bundling a project service that imports it must not
// pull the project's function types, services or any other `#pikku/*` module
// into a Worker or standalone bundle.
import assert from 'node:assert/strict'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createScriptContent,
  existsOnDisk,
  ingestText,
} from './script-content.js'

const verifier = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { build } = await import('esbuild')
const store = createScriptContent(
  resolve(verifier, '.pikku-runtime/script-content')
)
const exists = (file: string) => existsOnDisk(store, file)

const typed = join(verifier, 'scenarios/typed')
const leaf = join(typed, '.pikku/provider/provider-types.gen.ts')
assert.ok(await exists(leaf), 'the project got a #pikku/provider leaf')
assert.ok(
  await exists(join(typed, '.pikku/provider/index.ts')),
  '#pikku/provider resolves to an index'
)

// Not generated for an addon: it has no singleton services type of its own.
for (const addon of ['svc-notify', 'svc-select', 'svc-bad']) {
  for (const file of ['index.ts', 'provider-types.gen.ts']) {
    assert.equal(
      await exists(join(verifier, addon, '.pikku/addon/service', file)),
      false,
      `${addon} must not get a #pikku/provider leaf (${file})`
    )
  }
}

// The generated module's only runtime import is core.
const generated = await ingestText(store, leaf)
const runtimeImports = [...generated.matchAll(/^import (?!type)[^\n]*$/gm)].map(
  (m) => m[0]
)
assert.deepEqual(runtimeImports, [
  "import { defineProvider as coreProvider } from '@pikku/core/provider'",
])
assert.match(
  generated,
  /^import type \{ SingletonServices as BaseSingletonServices/m
)
assert.match(
  generated,
  /"ledger": Provided<typeof import\("[^"]*ledger[^"]*"\)\.ledger, "ledger">/,
  'what a service provides is looked up in the service itself'
)

// Bundled for a Worker (esbuild, browser platform) the leaf is erased down to
// core's helper.
const bundled = await build({
  entryPoints: [join(typed, 'src/ledger.ts')],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'esm',
  logLevel: 'silent',
})
const bundle = bundled.outputFiles[0]!.text
assert.ok(bundle.includes('record'), 'the service itself is bundled')
assert.ok(!bundle.includes('#pikku/'), 'no #pikku specifier survives bundling')
for (const pulledIn of [
  'pikkuFunc',
  'pikkuServices',
  'createSingletonServices',
]) {
  assert.ok(
    !bundle.includes(pulledIn),
    `bundling a service must not pull in ${pulledIn}`
  )
}

// And the bundle still runs: the helper is core's identity registration.
const mod = await import(
  `data:text/javascript;base64,${Buffer.from(bundle).toString('base64')}`
)
assert.equal(typeof mod.ledger.common, 'function')
assert.equal(typeof mod.ledger.onServerStart, 'function')
const recorded: string[] = []
const provided = mod.ledger.common({
  logger: { info: (event: string) => recorded.push(event) },
})
provided.ledger.record('hello')
assert.deepEqual(recorded, ['hello'])

console.log('typed service: all checks passed')
