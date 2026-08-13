import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `TypedScenario` narrows core's `given`/`when`/`then` over the project's
 * own step map, and the generated function types then require it to satisfy
 * `PikkuScenarioWire`. That assignability is the whole contract.
 *
 * The fixture imports the real `@pikku/core` wire (so a change to core's
 * signature is caught here, not in a downstream project) and pairs it with the
 * TypedScenarioSteps that serializeWorkflowTypes emits — pinned in lockstep by
 * the sibling serialize-workflow-types.test.ts. Both directions are covered: a
 * populated step map and an empty one.
 */
const WIRE = `
import type { PikkuWorkflowWire } from '@pikku/core/workflow'
import type { PikkuScenarioWire, ScenarioStepOptions } from '@pikku/core/scenario'

interface TypedWorkflow extends PikkuWorkflowWire {}
`

/** Written inside the package so the fixture resolves @pikku/core from node_modules. */
const FIXTURE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..'
)

const generated = (stepMap: string) => `
type FlattenedScenarioStepMap = ${stepMap}

interface TypedScenarioSteps {
  step<K extends keyof FlattenedScenarioStepMap>(
    stepName: string,
    stepFunc: K,
    data?: FlattenedScenarioStepMap[K]['input'],
    options?: ScenarioStepOptions
  ): Promise<FlattenedScenarioStepMap[K]['output']>

  given<K extends keyof FlattenedScenarioStepMap>(
    stepName: string,
    stepFunc: K,
    data?: FlattenedScenarioStepMap[K]['input'],
    options?: ScenarioStepOptions
  ): Promise<FlattenedScenarioStepMap[K]['output']>

  when<K extends keyof FlattenedScenarioStepMap>(
    stepName: string,
    stepFunc: K,
    data?: FlattenedScenarioStepMap[K]['input'],
    options?: ScenarioStepOptions
  ): Promise<FlattenedScenarioStepMap[K]['output']>

  then<K extends keyof FlattenedScenarioStepMap>(
    stepName: string,
    stepFunc: K,
    data?: FlattenedScenarioStepMap[K]['input'],
    options?: ScenarioStepOptions
  ): Promise<FlattenedScenarioStepMap[K]['output']>
}

type TypedScenario = TypedWorkflow &
  Omit<PikkuScenarioWire, keyof PikkuWorkflowWire | keyof TypedScenarioSteps> &
  TypedScenarioSteps
`

const POPULATED = `{
  readonly 'opensConsolePage': { input: { path: string }; output: { url: string } }
  readonly 'expectsText': { input: { actual: string; contains: string }; output: { found: true } }
}`

const typeErrors = (source: string): string[] => {
  const dir = mkdtempSync(join(FIXTURE_ROOT, '.scenario-step-compile-'))
  try {
    const file = join(dir, 'fixture.ts')
    writeFileSync(file, source)
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

describe('TypedScenario satisfies PikkuScenarioWire', () => {
  test('a populated step map still satisfies the core wire', () => {
    const errors = typeErrors(`${WIRE}${generated(POPULATED)}
declare const scenario: TypedScenario
export const wire: PikkuScenarioWire = scenario
`)
    assert.deepEqual(errors, [])
  })

  test('an empty step map still satisfies the core wire', () => {
    const errors = typeErrors(`${WIRE}${generated('{}')}
declare const scenario: TypedScenario
export const wire: PikkuScenarioWire = scenario
`)
    assert.deepEqual(errors, [])
  })

  test('the narrowed step names and data are still enforced', () => {
    const unknownStep = typeErrors(`${WIRE}${generated(POPULATED)}
declare const scenario: TypedScenario
export const run = async () => scenario.when('x', 'notAStep', { path: '/' })
`)
    assert.ok(
      unknownStep.some((e) => e.includes('notAStep')),
      `expected an unknown step name to be rejected, got ${JSON.stringify(unknownStep)}`
    )

    const wrongData = typeErrors(`${WIRE}${generated(POPULATED)}
declare const scenario: TypedScenario
export const run = async () => scenario.when('x', 'opensConsolePage', { nope: 1 })
`)
    assert.ok(
      wrongData.length > 0,
      'expected data of the wrong shape to be rejected'
    )
  })

  test('the step output is narrowed, not any', () => {
    const errors = typeErrors(`${WIRE}${generated(POPULATED)}
declare const scenario: TypedScenario
export const run = async () => {
  const opened = await scenario.when('x', 'opensConsolePage', { path: '/' })
  const bad: number = opened.url
  return bad
}
`)
    assert.ok(
      errors.length > 0,
      'expected the narrowed { url: string } output to reject a number'
    )
  })
})
