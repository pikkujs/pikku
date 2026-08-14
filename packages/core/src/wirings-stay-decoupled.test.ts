import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname, resolve, relative, sep } from 'node:path'

const srcRoot = dirname(fileURLToPath(import.meta.url))
const wiringsRoot = join(srcRoot, 'wirings')

/** Type-only statements are erased, so they couple nothing at runtime. */
const TYPE_ONLY = /^\s*(?:import|export)\s+type\b/

/**
 * Which wire may reach which, at runtime.
 *
 * A wire should be self-contained apart from what is genuinely common, so every
 * entry here is a deliberate crossover point rather than an accident. Adding one
 * is a visible diff — and worth asking whether the dependency could be
 * type-only, which couples nothing at runtime.
 */
const ALLOWED: Record<string, string[]> = {
  // A channel is an HTTP upgrade, so it builds on the HTTP wire.
  channel: ['http'],
  // `remote` on a wire with no peer — one leaf module, not the channel runtime.
  http: ['channel'],
  cli: ['channel'],
  // An agent streams over a channel and is invoked over rpc, and grades itself
  // as the last thing a finished run does.
  agent: ['channel', 'rpc', 'agent-scorer'],
  // A judge is a degenerate agent — it builds agent messages and runs them —
  // and a grade is dispatched to a queue.
  'agent-scorer': ['agent', 'queue'],
  // `wire.rpc.agent` — the facade lives with the agent runtime it delegates to.
  rpc: ['agent'],
  gateway: ['http'],
  mcp: ['rpc'],
  trigger: ['rpc'],
  // A workflow step is dispatched to a queue, invoked over rpc, or slept on.
  workflow: ['queue', 'rpc', 'scheduler'],
  // A virtual user drives a scenario, which is a workflow, as a persona.
  'virtual-user': ['role', 'workflow'],
  persona: ['virtual-user'],
}

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      return entry.name === 'dist' ? [] : sourceFiles(entryPath)
    }
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')
      ? [entryPath]
      : []
  })

/** Every wire each wire reaches at runtime, following value imports only. */
const crossWireEdges = (): Map<string, Set<string>> => {
  const edges = new Map<string, Set<string>>()

  for (const file of sourceFiles(wiringsRoot)) {
    const from = relative(wiringsRoot, file).split(sep)[0]!

    for (const line of readFileSync(file, 'utf-8').split('\n')) {
      if (TYPE_ONLY.test(line)) continue
      const specifier = line.match(/\bfrom\s+'(\.[^']+)'/)?.[1]
      if (!specifier) continue

      const target = resolve(dirname(file), specifier)
      if (!target.startsWith(wiringsRoot + sep)) continue

      const to = relative(wiringsRoot, target).split(sep)[0]!
      if (to === from) continue
      if (!edges.has(from)) edges.set(from, new Set())
      edges.get(from)!.add(to)
    }
  }

  return edges
}

describe('wirings stay decoupled', () => {
  test('no wire reaches a wire it is not declared to', () => {
    const undeclared = [...crossWireEdges()]
      .flatMap(([from, tos]) =>
        [...tos]
          .filter((to) => !(ALLOWED[from] ?? []).includes(to))
          .map((to) => `${from} -> ${to}`)
      )
      .sort()

    assert.deepEqual(
      undeclared,
      [],
      'a wire gained a runtime dependency on another wire:\n' +
        `${undeclared.join('\n')}\n` +
        'Add it to ALLOWED only if it is genuinely necessary — a type-only ' +
        'import couples nothing.'
    )
  })

  test('every declared crossover still exists', () => {
    const actual = crossWireEdges()
    const stale = Object.entries(ALLOWED)
      .flatMap(([from, tos]) =>
        tos
          .filter((to) => !actual.get(from)?.has(to))
          .map((to) => `${from} -> ${to}`)
      )
      .sort()

    assert.deepEqual(
      stale,
      [],
      `these crossovers are declared but no longer real — delete them:\n${stale.join('\n')}`
    )
  })

  test('the walker finds the edges it is meant to', () => {
    // Guards both tests above: a walker that resolved nothing would pass
    // whatever the wirings imported.
    const edges = crossWireEdges()
    assert.ok(
      edges.get('channel')?.has('http'),
      `expected channel -> http; walker found ${edges.size} wires with edges`
    )
  })
})
