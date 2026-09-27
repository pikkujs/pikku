/**
 * OpenAPI → addon verifier.
 *
 * Generates an addon from fixtures/petstore.openapi.json with the same command
 * an agent runs (`pikku new addon <name> --openapi <spec>`), then builds it
 * the way the generated package's own `build` script does:
 *   1. pikku new addon petstore --openapi … --no-build   (generate only)
 *   2. every zod schema lives in a *.schemas.ts that never imports #pikku
 *   3. pikku all inside the addon, with no schema left unconverted
 *   4. tsc, then pikku dist                               (the build script)
 *   5. the built addon carries a JSON schema for each function's input
 *
 * Step 3 is where it used to break: the addon's `#pikku/*` imports point into
 * `dist/`, which does not exist before the first build, so codegen could not
 * import a function file to read the schemas declared in it.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const generatedDir = join(here, 'generated')
const addonDir = join(generatedDir, 'addon-petstore')

const PIKKU = join(repoRoot, 'packages/cli/dist/bin/pikku.js')
const TSC = join(repoRoot, 'node_modules/.bin/tsc')

function run(label, file, args, cwd) {
  console.log(`\n▶ ${label}`)
  try {
    return execFileSync(file, args, { cwd, encoding: 'utf8', stdio: 'pipe' })
  } catch (e) {
    process.stdout.write(e.stdout ?? '')
    process.stderr.write(e.stderr ?? '')
    throw new Error(`${label} exited ${e.status}`)
  }
}

function fail(message) {
  console.error(`\n✗ ${message}`)
  process.exit(1)
}

rmSync(generatedDir, { recursive: true, force: true })

run(
  'pikku new addon petstore --openapi',
  'node',
  [
    PIKKU,
    'new',
    'addon',
    'petstore',
    '--openapi',
    'fixtures/petstore.openapi.json',
    '--dir',
    'generated',
    '--credential',
    'bearer',
    '--no-build',
  ],
  here
)

const functionsDir = join(addonDir, 'src', 'functions')
const files = readdirSync(functionsDir)
const schemaFiles = files.filter((f) => f.endsWith('.schemas.ts'))
if (schemaFiles.length === 0) fail('no *.schemas.ts was generated')
for (const f of schemaFiles) {
  if (readFileSync(join(functionsDir, f), 'utf8').includes('#pikku')) {
    fail(`${f} imports #pikku — codegen cannot load it before the first build`)
  }
}
for (const f of files.filter((f) => f.endsWith('.function.ts'))) {
  if (readFileSync(join(functionsDir, f), 'utf8').includes("from 'zod'")) {
    fail(`${f} declares zod schemas — they belong in its .schemas.ts`)
  }
}
console.log(`  ${schemaFiles.length} schemas files, none importing #pikku`)

const codegen = run('addon: pikku all', 'node', [PIKKU, 'all'], addonDir)
if (codegen.includes('Could not convert Zod schema')) {
  process.stdout.write(codegen)
  fail('pikku all left zod schemas unconverted')
}

run('addon: tsc', TSC, ['-p', 'tsconfig.json'], addonDir)
run('addon: pikku dist', 'node', [PIKKU, 'dist'], addonDir)

const schemasOut = join(
  addonDir,
  'dist',
  '.pikku',
  'addon',
  'schemas',
  'schemas'
)
for (const name of ['GetPetInput', 'CreatePetInput', 'ListPetsOutput']) {
  if (!existsSync(join(schemasOut, `${name}.schema.json`))) {
    fail(
      `the built addon has no JSON schema for ${name} (looked in ${schemasOut})`
    )
  }
}

console.log('\n✓ OpenAPI addon generates, builds and ships its schemas')
