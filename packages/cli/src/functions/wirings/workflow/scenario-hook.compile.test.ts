import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * A scenario hook is the one scenario primitive that is never registered — it
 * runs in process, is passed by value on the config, and has no name in any
 * generated map. It still gets a factory, because a factory is what gives an
 * inline function a call site to be contextually typed from: without one every
 * hook has to carry a type annotation, and every other primitive infers.
 *
 * So the contract here is inference, not registration: written inline through
 * `pikkuScenarioHook`, the wire is typed (its `actors` are reachable, a member
 * that does not exist is an error) and the result still satisfies `before` /
 * `after` on a scenario config.
 */
const HERE = dirname(fileURLToPath(import.meta.url))

/** Written inside the package so the fixture resolves @pikku/core from node_modules. */
const FIXTURE_ROOT = join(HERE, '../../../..')

/**
 * The hook half of the emitted types, lifted verbatim from the template
 * literal that emits it (so the template's escaped backticks and dollar signs
 * come back to their emitted form).
 */
const hookTypes = (): string => {
  const source = readFileSync(
    join(HERE, 'serialize-workflow-types.ts'),
    'utf-8'
  )
  const start = source.indexOf('/**\n * A scenario lifecycle hook:')
  const end = source.indexOf('/**\n * A scenario: a complex workflow')
  assert.ok(start > 0 && end > start, 'hook block not found in the serializer')
  return source.slice(start, end).replace(/\\`/g, '`').replace(/\\\$/g, '$')
}

const PRELUDE = `
type StandardSchemaV1 = { readonly '~standard': unknown }
type InferSchemaOutput<S> = S extends { readonly __out?: infer O } ? O : unknown

type ScenarioWire = {
  scenario: { then: (label: string, step: string, data: unknown) => Promise<unknown> }
  actors: { admin: { invoke: (name: string, data: unknown) => Promise<unknown> } }
}

type PikkuFunctionScenario<In = unknown, Out = never> = (
  services: unknown,
  data: In,
  wire: ScenarioWire
) => Promise<Out>

${hookTypes()}
`

const typeErrors = (body: string): string[] => {
  const dir = mkdtempSync(join(FIXTURE_ROOT, '.scenario-hook-compile-'))
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

describe('pikkuScenarioHook', () => {
  test('an inline hook needs no annotation and gets a typed wire', () => {
    assert.deepEqual(
      typeErrors(`
        export const cleansUp = pikkuScenarioHook(async (_services, _data, { actors }) => {
          await actors.admin.invoke('console:credentialDelete', { name: 'fake-crm' })
        })
      `),
      []
    )
  })

  test('a wire member that does not exist is a compile error', () => {
    const errors = typeErrors(`
      export const cleansUp = pikkuScenarioHook(async (_services, _data, { players }) => {
        void players
      })
    `)
    assert.ok(
      errors.some((e) => e.includes('players')),
      `expected an error naming 'players', got: ${errors.join(' | ')}`
    )
  })

  test('the result satisfies a scenario config hook slot', () => {
    assert.deepEqual(
      typeErrors(`
        const cleansUp = pikkuScenarioHook(async (_services, _data, { actors }) => {
          void actors
        })
        declare const takesHook: (hook: PikkuScenarioHook) => void
        takesHook(cleansUp)
      `),
      []
    )
  })

  test('a hook still declares its input when the scenario takes one', () => {
    const errors = typeErrors(`
      export const cleansUp = pikkuScenarioHook<{ name: string }>(
        async (_services, data) => {
          void data.nmae
        }
      )
    `)
    assert.ok(
      errors.some((e) => e.includes('nmae')),
      `expected an error naming 'nmae', got: ${errors.join(' | ')}`
    )
  })
})
