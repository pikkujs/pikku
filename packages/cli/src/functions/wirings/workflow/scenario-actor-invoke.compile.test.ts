import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serializeVirtualUsers } from './serialize-virtual-users.js'

/**
 * A scenario actor invokes exposed RPCs over the real transport, so the surface
 * it can reach is exactly the generated exposed RPC map. This pins that the
 * emitted `TypedVirtualUsers` narrows `invoke` over that map — an unknown RPC
 * name or a wrong payload has to be a compile error, not a 400 at run time.
 *
 * The fixture runs the real serializer and swaps its two type imports for local
 * declarations, so it pins the emitted types rather than a copy of them.
 */
const HEADER = `
interface AgentMap {
  readonly 'chatAgent': { input: unknown; output: unknown }
}

type FlattenedRPCMap = {
  readonly 'todos:listTodos': { input: { limit: number }; output: { todos: string[] } }
  readonly 'console:ping': { input: null; output: { ok: true } }
}
`

/** Written inside the package so the fixture resolves @pikku/core from node_modules. */
const FIXTURE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..'
)

const generated = () =>
  serializeVirtualUsers(
    {
      admin: {
        id: 'admin',
        name: 'Admin',
        email: 'admin@example.com',
        roles: [],
        goals: [],
        tags: [],
        runnable: true,
      },
    },
    './agent-map.js',
    './rpc-map.js'
  )
    // Drop the imports of generated neighbours — the agent and RPC maps — which
    // the fixture directory does not have. Imports of `@pikku/core/*` are kept
    // and must resolve, since narrowing `invoke` is the whole subject here.
    // Matched as whole statements rather than by line, because a multi-line
    // `import type { … }` would otherwise leave its body behind as loose code.
    .replace(/^import\s+(?:type\s+)?\{[^}]*\}\s+from\s+'\.[^']*'\n/gm, '')

const typeErrors = (source: string): string[] => {
  const dir = mkdtempSync(join(FIXTURE_ROOT, '.scenario-actor-compile-'))
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

describe('TypedVirtualUsers narrows invoke over the exposed RPC map', () => {
  test('a known RPC with the right payload compiles, and its output is narrowed', () => {
    const errors = typeErrors(`${HEADER}${generated()}
declare const actors: TypedVirtualUsers
export const run = async () => {
  const listed = await actors.admin.invoke('todos:listTodos', { limit: 5 })
  const todos: string[] = listed.todos
  return todos
}
`)
    assert.deepEqual(errors, [])
  })

  test('an unknown RPC name is rejected', () => {
    const errors = typeErrors(`${HEADER}${generated()}
declare const actors: TypedVirtualUsers
export const run = async () => actors.admin.invoke('todos:notAnRpc', { limit: 5 })
`)
    assert.ok(
      errors.some((e) => e.includes('notAnRpc')),
      `expected an unknown RPC name to be rejected, got ${JSON.stringify(errors)}`
    )
  })

  test('a payload of the wrong shape is rejected', () => {
    const errors = typeErrors(`${HEADER}${generated()}
declare const actors: TypedVirtualUsers
export const run = async () => actors.admin.invoke('todos:listTodos', { nope: 1 })
`)
    assert.ok(
      errors.length > 0,
      'expected a payload of the wrong shape to be rejected'
    )
  })

  test('the narrowed output is not any', () => {
    const errors = typeErrors(`${HEADER}${generated()}
declare const actors: TypedVirtualUsers
export const run = async () => {
  const listed = await actors.admin.invoke('todos:listTodos', { limit: 5 })
  const wrong: number = listed.todos
  return wrong
}
`)
    assert.ok(
      errors.length > 0,
      'expected the narrowed { todos: string[] } output to reject a number'
    )
  })

  test('invokeRaw is narrowed the same way and still reports the status', () => {
    const errors = typeErrors(`${HEADER}${generated()}
declare const actors: TypedVirtualUsers
export const run = async () => {
  const res = await actors.admin.invokeRaw('console:ping', null, {
    headers: { 'x-user-id': 'someone' },
  })
  const status: number = res.status
  return status
}
`)
    assert.deepEqual(errors, [])
  })

  test('an undeclared actor is rejected', () => {
    const errors = typeErrors(`${HEADER}${generated()}
declare const actors: TypedVirtualUsers
export const run = async () => actors.nobody.invoke('console:ping', null)
`)
    assert.ok(
      errors.some((e) => e.includes('nobody')),
      `expected an undeclared actor to be rejected, got ${JSON.stringify(errors)}`
    )
  })

  test('the narrowed registry still satisfies the wire constraint', () => {
    const errors = typeErrors(`${HEADER}${generated()}
import type { PikkuWire } from '@pikku/core/types'
import type { ScenarioVirtualUsers } from '@pikku/core/services'

declare const actors: TypedVirtualUsers
export const open: ScenarioVirtualUsers = actors
export type Wire = PikkuWire<
  unknown,
  unknown,
  false,
  any,
  any,
  null,
  never,
  any,
  unknown,
  any,
  TypedVirtualUsers
>
export const stepActor = (wire: Wire) => wire.actor
`)
    assert.deepEqual(errors, [])
  })

  test('HttpVirtualUser still satisfies the default generic', () => {
    const errors = typeErrors(`
import type { HttpVirtualUser } from '@pikku/core/virtual-user'
import type { ScenarioVirtualUser } from '@pikku/core/services'

declare const actor: HttpVirtualUser
export const untyped: ScenarioVirtualUser = actor
export const run = async () => actor.invoke('anything', { whatever: true })
`)
    assert.deepEqual(errors, [])
  })
})
