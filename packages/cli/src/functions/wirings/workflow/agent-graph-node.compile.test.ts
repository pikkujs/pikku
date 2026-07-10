import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * The graph type machinery emitted by serializeWorkflowTypes, paired with stub
 * RPC / workflow / agent maps. Kept in lockstep with the emitter — the sibling
 * serialize-workflow-types.test.ts pins that the emitter still produces these
 * exact constructs, while this file proves they compile and enforce the union.
 */
const MACHINERY = `
type FlattenedRPCMap = {
  userCreate: { input: { name: string }; output: { email: string; id: string } }
  emailSend: { input: { to: string; subject: string; body: string }; output: { sent: boolean } }
}
type FlattenedWorkflowMap = {
  onboardWorkflow: { input: { userId: string }; output: { done: boolean } }
}
type FlattenedAgentMap = {
  readonly summarize: { output: { summary: string; score: number } }
}

type TypedRef<T> = { $ref: string; path?: string } & { __phantomType?: T }
type TemplateString = {
  $template: { parts: string[]; expressions: Array<{ $ref: string; path?: string }> }
} & { __brand: 'TemplateString' }
type InputWithRefs<T> = {
  [K in keyof T]?: T[K] | TypedRef<T[K]> | TypedRef<unknown> | TemplateString
}
type NodeInputType<FuncMap extends Record<string, string>, K extends keyof FuncMap> =
  FuncMap[K] extends keyof FlattenedRPCMap
    ? InputWithRefs<FlattenedRPCMap[FuncMap[K]]['input']>
    : FuncMap[K] extends keyof FlattenedWorkflowMap
      ? InputWithRefs<FlattenedWorkflowMap[FuncMap[K]]['input']>
      : Record<string, unknown>
type NodeOutputKeys<FuncMap extends Record<string, string>, N extends string> =
  N extends keyof FuncMap
    ? FuncMap[N] extends keyof FlattenedRPCMap
      ? keyof FlattenedRPCMap[FuncMap[N]]['output'] & string
      : FuncMap[N] extends keyof FlattenedWorkflowMap
        ? keyof FlattenedWorkflowMap[FuncMap[N]]['output'] & string
        : FuncMap[N] extends keyof FlattenedAgentMap
          ? keyof FlattenedAgentMap[FuncMap[N]]['output'] & string
          : string
    : string
type RefFunction<FuncMap extends Record<string, string>> = {
  <N extends Extract<keyof FuncMap, string>>(nodeId: N, path: NodeOutputKeys<FuncMap, N>): TypedRef<unknown>
  (nodeId: 'trigger' | '$item', path?: string): TypedRef<unknown>
}
type TemplateFunction = (templateStr: string, refs: TypedRef<unknown>[]) => TemplateString
type NextConfig<NodeIds extends string> = NodeIds | NodeIds[] | { if: string; then: NodeIds; else?: NodeIds }
type GraphNodeConfigMap<FuncMap extends Record<string, string>> = {
  [K in Extract<keyof FuncMap, string>]?: {
    next?: NextConfig<Extract<keyof FuncMap, string>>
    input?:
      | NodeInputType<FuncMap, K>
      | (() => NodeInputType<FuncMap, K>)
      | ((ref: RefFunction<FuncMap>, template: TemplateFunction) => NodeInputType<FuncMap, K>)
    onError?: Extract<keyof FuncMap, string> | Extract<keyof FuncMap, string>[]
  }
}
interface PikkuWorkflowGraphConfig<FuncMap extends Record<string, string>, T> {
  disabled?: true; name?: string; description?: string; tags?: string[]; nodes: FuncMap; config?: T
}
interface PikkuWorkflowGraphResult { __type: 'pikkuWorkflowGraph' }
declare function pikkuWorkflowGraph<
  const FuncMap extends Record<
    string,
    | (keyof FlattenedRPCMap & string)
    | (keyof FlattenedWorkflowMap & string)
    | (keyof FlattenedAgentMap & string)
  >
>(config: PikkuWorkflowGraphConfig<FuncMap, GraphNodeConfigMap<FuncMap>>): PikkuWorkflowGraphResult
`

const typeErrors = (consumer: string): string[] => {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-agent-graph-'))
  try {
    const file = join(dir, 'fixture.ts')
    writeFileSync(file, `${MACHINERY}\n${consumer}\n`)
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

describe('pikkuWorkflowGraph agent-name nodes', () => {
  test('an agent-name node compiles and a downstream node refs its output', () => {
    const errors = typeErrors(`
export const g = pikkuWorkflowGraph({
  nodes: { entry: 'userCreate', classify: 'summarize', notify: 'emailSend' },
  config: {
    entry: { next: 'classify' },
    classify: { next: 'notify', input: (ref) => ({ message: ref('entry', 'email') }) },
    notify: {
      input: (ref) => ({
        to: ref('entry', 'email'),
        subject: ref('classify', 'summary'),
        body: 'hi',
      }),
    },
  },
})
`)
    assert.deepEqual(errors, [])
  })

  test('a sub-workflow name is also accepted as a node func', () => {
    const errors = typeErrors(
      `export const g = pikkuWorkflowGraph({ nodes: { a: 'onboardWorkflow' } })`
    )
    assert.deepEqual(errors, [])
  })

  test('an unknown node func name (not an rpc, workflow, or agent) is rejected', () => {
    const errors = typeErrors(
      `export const g = pikkuWorkflowGraph({ nodes: { x: 'notARealThing' } })`
    )
    assert.ok(
      errors.some((e) => e.includes('notARealThing')),
      `expected a rejection mentioning notARealThing, got ${JSON.stringify(errors)}`
    )
  })

  test('ref() against a non-existent agent output key is rejected', () => {
    const errors = typeErrors(`
export const g = pikkuWorkflowGraph({
  nodes: { classify: 'summarize', notify: 'emailSend' },
  config: {
    notify: { input: (ref) => ({ to: ref('classify', 'nope'), subject: 's', body: 'b' }) },
  },
})
`)
    assert.ok(
      errors.length > 0,
      'expected ref() to reject an unknown agent output key'
    )
  })
})
