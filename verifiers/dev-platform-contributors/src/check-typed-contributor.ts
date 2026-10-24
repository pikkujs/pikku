// `#pikku/contributor` is generated for a project, not for an addon, and at
// runtime it is only core's helper: bundling a project contributor that imports
// it must not pull the project's function types, services or any other
// `#pikku/*` module into a Worker or standalone bundle.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const verifier = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { build } = await import('esbuild')

const typed = join(verifier, 'scenarios/typed')
const leaf = join(typed, '.pikku/contributor/pikku-contributor-types.gen.ts')
assert.ok(existsSync(leaf), 'the project got a #pikku/contributor leaf')
assert.ok(
  existsSync(join(typed, '.pikku/contributor/index.ts')),
  '#pikku/contributor resolves to an index'
)

// Not generated for an addon: it has no singleton services type of its own.
for (const addon of ['contrib-notify', 'contrib-select', 'contrib-bad']) {
  for (const file of ['index.ts', 'pikku-contributor-types.gen.ts']) {
    assert.equal(
      existsSync(join(verifier, addon, '.pikku/addon/contributor', file)),
      false,
      `${addon} must not get a #pikku/contributor leaf (${file})`
    )
  }
}

// The generated module's only runtime import is core.
const generated = readFileSync(leaf, 'utf8')
const runtimeImports = [...generated.matchAll(/^import (?!type)[^\n]*$/gm)].map(
  (m) => m[0]
)
assert.deepEqual(runtimeImports, [
  "import { defineContributors as coreDefineContributors } from '@pikku/core/contributors'",
])
assert.match(generated, /^import type \{ SingletonServices/m)

// Bundled for a Worker (esbuild, browser platform) the leaf is erased down to
// core's helper.
const bundled = await build({
  entryPoints: [join(typed, 'src/contributors.ts')],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'esm',
  logLevel: 'silent',
})
const bundle = bundled.outputFiles[0]!.text
assert.ok(bundle.includes('ledgerDev'), 'the contributor itself is bundled')
assert.ok(!bundle.includes('#pikku/'), 'no #pikku specifier survives bundling')
for (const pulledIn of [
  'pikkuFunc',
  'pikkuServices',
  'createSingletonServices',
]) {
  assert.ok(
    !bundle.includes(pulledIn),
    `bundling a contributor must not pull in ${pulledIn}`
  )
}

// And the bundle still runs: the helper is core's identity registration.
const mod = await import(
  `data:text/javascript;base64,${Buffer.from(bundle).toString('base64')}`
)
assert.deepEqual(Object.keys(mod.contributors), ['ledger'])
assert.deepEqual(mod.contributors.ledger.dev.provides, ['ledger'])
assert.equal(mod.contributors.ledger.dev, mod.ledgerDev)

console.log('typed contributor: all checks passed')
