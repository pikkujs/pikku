import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * The same emitted graph machinery as agent-graph-node.compile.test.ts, used
 * here to prove the forEach fanout surface is purely additive: the existing
 * `(ref) => ...` and `(ref, template) => ...` input shapes must still compile
 * unchanged alongside the appended `$item` parameter.
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
type ItemFunction = (path?: string) => TypedRef<unknown>
type ForEachConfig<FuncMap extends Record<string, string>> =
  | Extract<keyof FuncMap, string>
  | ((ref: RefFunction<FuncMap>) => TypedRef<unknown>)
type NextConfig<NodeIds extends string> = NodeIds | NodeIds[] | { if: string; then: NodeIds; else?: NodeIds }
type GraphNodeConfigMap<FuncMap extends Record<string, string>> = {
  [K in Extract<keyof FuncMap, string>]?: {
    next?: NextConfig<Extract<keyof FuncMap, string>>
    forEach?: ForEachConfig<FuncMap>
    mode?: 'parallel' | 'sequential'
    input?:
      | NodeInputType<FuncMap, K>
      | (() => NodeInputType<FuncMap, K>)
      | ((ref: RefFunction<FuncMap>, template: TemplateFunction, $item: ItemFunction) => NodeInputType<FuncMap, K>)
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
  const dir = mkdtempSync(join(tmpdir(), 'pikku-graph-foreach-'))
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

describe('pikkuWorkflowGraph forEach fanout', () => {
  test('a forEach node id with $item() input compiles', () => {
    const errors = typeErrors(`
export const g = pikkuWorkflowGraph({
  nodes: { entry: 'userCreate', notify: 'emailSend' },
  config: {
    entry: { next: 'notify' },
    notify: {
      forEach: 'entry',
      input: (ref, template, $item) => ({
        to: $item('email'),
        subject: $item(),
        body: 'hi',
      }),
    },
  },
})
`)
    assert.deepEqual(errors, [])
  })

  test('forEach also accepts a (ref) callback, with a sequential mode', () => {
    const errors = typeErrors(`
export const g = pikkuWorkflowGraph({
  nodes: { entry: 'userCreate', notify: 'emailSend' },
  config: {
    entry: { next: 'notify' },
    notify: {
      forEach: (ref) => ref('entry', 'email'),
      mode: 'sequential',
      input: (ref, template, $item) => ({ to: $item(), subject: 's', body: 'b' }),
    },
  },
})
`)
    assert.deepEqual(errors, [])
  })

  test('forEach rejects a node id that is not in the graph', () => {
    const errors = typeErrors(`
export const g = pikkuWorkflowGraph({
  nodes: { entry: 'userCreate', notify: 'emailSend' },
  config: { notify: { forEach: 'nope' } },
})
`)
    assert.ok(
      errors.length > 0,
      'expected forEach to reject an unknown node id'
    )
  })

  test('mode rejects an unknown value', () => {
    const errors = typeErrors(`
export const g = pikkuWorkflowGraph({
  nodes: { entry: 'userCreate', notify: 'emailSend' },
  config: { notify: { forEach: 'entry', mode: 'batched' } },
})
`)
    assert.ok(errors.length > 0, 'expected mode to reject an unknown value')
  })

  test('an existing single-param (ref) => ... node still compiles untouched', () => {
    const errors = typeErrors(`
export const g = pikkuWorkflowGraph({
  nodes: { entry: 'userCreate', notify: 'emailSend' },
  config: {
    entry: { next: 'notify' },
    notify: {
      input: (ref) => ({ to: ref('entry', 'email'), subject: 's', body: 'b' }),
    },
  },
})
`)
    assert.deepEqual(errors, [])
  })

  test('an existing (ref, template) => ... node still compiles untouched', () => {
    const errors = typeErrors(`
export const g = pikkuWorkflowGraph({
  nodes: { entry: 'userCreate', notify: 'emailSend' },
  config: {
    entry: { next: 'notify' },
    notify: {
      input: (ref, template) => ({
        to: ref('entry', 'email'),
        subject: template('hi $0', [ref('entry', 'id')]),
        body: 'b',
      }),
    },
  },
})
`)
    assert.deepEqual(errors, [])
  })
})
