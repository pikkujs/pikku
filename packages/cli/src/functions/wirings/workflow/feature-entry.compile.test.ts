import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * A feature references its scenarios by imported identifier, and the paired
 * form carries the input to run one with. The contract worth having is that
 * `data` is checked against *that scenario's* input — a wrong shape must be a
 * compile error, not a surprise on the nth example row at runtime.
 *
 * That only holds if `PikkuFeatureEntry` can actually recover `In` from a
 * scenario reference, which in turn only holds while `In` sits somewhere
 * inferrable on `PikkuScenarioRef`. Rather than restate the types, the fixture
 * splices the real `pikkuFeature` block straight out of the serializer source,
 * so a change there is caught here.
 */
const HERE = dirname(fileURLToPath(import.meta.url))

/** Written inside the package so the fixture resolves @pikku/core from node_modules. */
const FIXTURE_ROOT = join(HERE, '../../../..')

/**
 * The `pikkuFeature` half of the emitted types, lifted verbatim from the
 * template literal that emits it (so the template's escaped backticks and
 * dollar signs come back to their emitted form).
 */
const featureTypes = (): string => {
  const source = readFileSync(
    join(HERE, 'serialize-workflow-types.ts'),
    'utf-8'
  )
  const start = source.indexOf('/**\n * A scenario as a feature references it.')
  const end = source.indexOf('export type PikkuFunctionScenarioStep<')
  assert.ok(
    start > 0 && end > start,
    'feature block not found in the serializer'
  )
  return source.slice(start, end).replace(/\\`/g, '`').replace(/\\\$/g, '$')
}

const PRELUDE = `
import type { CorePikkuFunctionSessionless } from '@pikku/core/function'
import type { CorePikkuFunctionConfig } from '@pikku/core'

type PikkuFunctionScenario<In = unknown, Out = never> = CorePikkuFunctionSessionless<In, Out>

type PikkuScenarioHook<In = unknown> = PikkuFunctionScenario<In, void>

type PikkuFunctionConfig<
  In = unknown,
  Out = unknown,
  RequiredWires = never,
  PikkuFunc extends PikkuFunctionScenario<In, Out> = PikkuFunctionScenario<In, Out>,
  InputSchema = undefined,
  OutputSchema = undefined
> = CorePikkuFunctionConfig<PikkuFunc>

${featureTypes()}

declare const voidScenario: PikkuFunctionConfig<void, { ok: boolean }, 'scenario' | 'actors', PikkuFunctionScenario<void, { ok: boolean }>>
declare const namedScenario: PikkuFunctionConfig<{ name: string }, { ok: boolean }, 'scenario' | 'actors', PikkuFunctionScenario<{ name: string }, { ok: boolean }>>
`

const typeErrors = (body: string): string[] => {
  const dir = mkdtempSync(join(FIXTURE_ROOT, '.feature-entry-compile-'))
  try {
    const file = join(dir, 'fixture.ts')
    writeFileSync(file, `${PRELUDE}\n${body}`)
    const program = ts.createProgram([file], {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
    })
    return ts
      .getPreEmitDiagnostics(program)
      .filter((d) => d.file?.fileName === file)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('pikkuFeature scenario entries', () => {
  test('bare scenario references compile', () => {
    assert.deepEqual(
      typeErrors(`
export const feature = pikkuFeature({
  name: 'F',
  scenarios: [voidScenario, namedScenario],
})
`),
      []
    )
  })

  test('a paired entry carrying the right data compiles', () => {
    assert.deepEqual(
      typeErrors(`
export const feature = pikkuFeature({
  name: 'F',
  scenarios: [{ scenario: namedScenario, data: { name: 'stripe' } }],
})
`),
      []
    )
  })

  test('a mapped loop of examples compiles', () => {
    assert.deepEqual(
      typeErrors(`
export const feature = pikkuFeature({
  name: 'F',
  tags: ['credential'],
  scenarios: [
    voidScenario,
    ...['stripe', 'google'].map((name) => ({ scenario: namedScenario, data: { name } })),
  ],
})
`),
      []
    )
  })

  test('data of the wrong shape is rejected', () => {
    const errors = typeErrors(`
export const feature = pikkuFeature({
  name: 'F',
  scenarios: [{ scenario: namedScenario, data: { nope: 1 } }],
})
`)
    assert.ok(
      errors.length > 0,
      'data must be checked against the referenced scenario, got no error'
    )
  })

  test('omitting data for a scenario that needs it is rejected', () => {
    const errors = typeErrors(`
export const feature = pikkuFeature({
  name: 'F',
  scenarios: [{ scenario: namedScenario }],
})
`)
    assert.ok(errors.length > 0, 'a paired entry without data must not compile')
  })

  test('a string name is not a scenario reference', () => {
    const errors = typeErrors(`
export const feature = pikkuFeature({
  name: 'F',
  scenarios: ['credentialLazyLoadScenario'],
})
`)
    assert.ok(
      errors.length > 0,
      'scenarios are referenced by identifier, not by name'
    )
  })

  test('the built feature is what addFeature accepts', () => {
    // The emitted wirings do exactly this, so `pikkuFeature`'s inferred type
    // has to satisfy `CoreFeature` — `const Scenarios` makes the list readonly,
    // which a mutable `CoreFeatureScenario[]` would reject.
    assert.deepEqual(
      typeErrors(`
import { addFeature } from '@pikku/core/scenario'

export const feature = pikkuFeature({
  name: 'F',
  scenarios: [voidScenario, { scenario: namedScenario, data: { name: 'stripe' } }],
})

addFeature('feature', feature)
`),
      []
    )
  })

  test('feature hooks take the scenario signature', () => {
    assert.deepEqual(
      typeErrors(`
const startsMockOAuthServer: PikkuScenarioHook = async (_services, _data, _wire) => {}

export const feature = pikkuFeature({
  name: 'F',
  before: startsMockOAuthServer,
  after: startsMockOAuthServer,
  scenarios: [voidScenario],
})
`),
      []
    )
  })
})
