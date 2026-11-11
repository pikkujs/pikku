import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname, resolve, relative, sep } from 'node:path'

const srcRoot = dirname(fileURLToPath(import.meta.url))

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
  // An agent is invoked over rpc, and grades itself as the last thing a
  // finished run does. Its own functions may come from an installed addon, so
  // it builds that addon's services the same way rpc does.
  agent: ['rpc', 'agent-scorer', 'addon'],
  // A grade is dispatched to a queue.
  'agent-scorer': ['queue'],
  // An rpc call is how an installed addon's function is reached, so the runner
  // resolves the addon instance that owns the namespace. `wire.rpc.agent` is
  // deliberately absent: the runner reaches the facade through state, because a
  // value import here pins the agent runtime into every deployment unit.
  rpc: ['addon'],
  gateway: ['http'],
  mcp: ['rpc'],
  trigger: ['rpc'],
  // A workflow step is dispatched to a queue, invoked over rpc, or slept on.
  workflow: ['queue', 'rpc', 'scheduler'],
  // A virtual user drives a scenario, which is a workflow.
  'virtual-user': ['role', 'workflow'],
}

/**
 * Which wires the code outside `wirings/` may reach, at runtime.
 *
 * Everything else in core is what the wires build on, so a value import from
 * here into a wire is the edge that turns into a cycle. These are the ones the
 * function runner genuinely needs on every invocation: none of them reaches
 * back into it.
 */
const FOUNDATION_ALLOWED: Record<string, string[]> = {
  // An invocation resolves the addon that owns it, its credential overrides
  // and its feature flags, and hands the function a `wire.rpc` to call others.
  // The rpc runner reaches the function runner back lazily, not statically.
  function: ['addon', 'credential', 'flag', 'rpc'],
}

/** Code layered on top of the wires: dev tooling and test helpers. */
const ABOVE_WIRINGS = new Set(['dev', 'testing', 'test-utils.ts'])

/**
 * Area cycles that exist today and are known to go through a leaf module.
 * Each is pinned so that it cannot grow, and so that removing it is noticed.
 */
const KNOWN_AREA_CYCLES = [
  // http-runner takes `unsupportedChannelRemote` from channel-rpc.types.ts.
  ['wirings/channel', 'wirings/http'],
]

/** How many modules `@pikku/core/services` may load. It was 102 before 0.13 and is 40. */
const SERVICES_MODULE_BUDGET = 45

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      return entry.name === 'dist' ? [] : sourceFiles(entryPath)
    }
    return entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.d.ts')
      ? [entryPath]
      : []
  })

/** One static import or re-export statement, which may span lines. */
const STATEMENT =
  /^\s*(?:import|export)\s+(type\s+)?([^'";]*?)\s*from\s*'(\.[^']+)'|^\s*import\s+'(\.[^']+)'/gm

/**
 * The relative specifiers a file loads at runtime. Type-only statements, and
 * braces naming nothing but types, are erased; a dynamic `import()` does not
 * run at module init, so neither is followed.
 */
const valueSpecifiers = (source: string): string[] =>
  [...source.matchAll(STATEMENT)].flatMap(
    ([, typeOnly, clause, specifier, bare]) => {
      if (bare) return [bare]
      if (typeOnly) return []
      const names = clause!.trim()
      if (names.startsWith('{') && names.endsWith('}')) {
        const members = names
          .slice(1, -1)
          .split(',')
          .map((member) => member.trim())
          .filter(Boolean)
        if (members.length && members.every((m) => m.startsWith('type ')))
          return []
      }
      return [specifier!]
    }
  )

const resolveSpecifier = (fromFile: string, specifier: string) => {
  const base = resolve(dirname(fromFile), specifier.replace(/\.js$/, ''))
  return [`${base}.ts`, join(base, 'index.ts')].find(existsSync)
}

/** Every module each module loads at runtime. */
const runtimeGraph = (): Map<string, string[]> =>
  new Map(
    sourceFiles(srcRoot).map((file) => [
      file,
      valueSpecifiers(readFileSync(file, 'utf-8'))
        .map((specifier) => resolveSpecifier(file, specifier))
        .filter((target): target is string => target !== undefined),
    ])
  )

/** A wire is `wirings/<name>`, a directory is itself, a root file is itself. */
const areaOf = (file: string): string => {
  const [first, second] = relative(srcRoot, file).split(sep)
  return first === 'wirings' ? `wirings/${second}` : first!
}

const areaGraph = (graph: Map<string, string[]>) => {
  const edges = new Map<string, Set<string>>()
  for (const [file, targets] of graph) {
    const from = areaOf(file)
    for (const target of targets) {
      const to = areaOf(target)
      if (to === from) continue
      if (!edges.has(from)) edges.set(from, new Set())
      edges.get(from)!.add(to)
    }
  }
  return edges
}

/** Strongly connected components with more than one member (Tarjan). */
const cycles = (
  nodes: Iterable<string>,
  next: (node: string) => Iterable<string>
): string[][] => {
  let counter = 0
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const found: string[][] = []

  const visit = (node: string) => {
    index.set(node, counter)
    low.set(node, counter++)
    stack.push(node)
    onStack.add(node)
    for (const target of next(node)) {
      if (!index.has(target)) {
        visit(target)
        low.set(node, Math.min(low.get(node)!, low.get(target)!))
      } else if (onStack.has(target)) {
        low.set(node, Math.min(low.get(node)!, index.get(target)!))
      }
    }
    if (low.get(node) === index.get(node)) {
      const component: string[] = []
      let member: string
      do {
        member = stack.pop()!
        onStack.delete(member)
        component.push(member)
      } while (member !== node)
      if (component.length > 1) found.push(component.sort())
    }
  }

  for (const node of nodes) if (!index.has(node)) visit(node)
  return found.sort((a, b) => a[0]!.localeCompare(b[0]!))
}

/** Every wire each wire reaches at runtime. */
const crossWireEdges = (): Map<string, Set<string>> => {
  const edges = new Map<string, Set<string>>()
  for (const [from, tos] of areaGraph(runtimeGraph())) {
    if (!from.startsWith('wirings/')) continue
    const wires = [...tos].filter((to) => to.startsWith('wirings/'))
    if (wires.length === 0) continue
    edges.set(
      from.slice('wirings/'.length),
      new Set(wires.map((to) => to.slice('wirings/'.length)))
    )
  }
  return edges
}

/** Every wire each area outside `wirings/` reaches at runtime. */
const foundationEdges = (): Map<string, Set<string>> => {
  const edges = new Map<string, Set<string>>()
  for (const [from, tos] of areaGraph(runtimeGraph())) {
    if (from.startsWith('wirings/') || ABOVE_WIRINGS.has(from)) continue
    const wires = [...tos].filter((to) => to.startsWith('wirings/'))
    if (wires.length === 0) continue
    edges.set(from, new Set(wires.map((to) => to.slice('wirings/'.length))))
  }
  return edges
}

const undeclaredEdges = (
  actual: Map<string, Set<string>>,
  allowed: Record<string, string[]>
) =>
  [...actual]
    .flatMap(([from, tos]) =>
      [...tos]
        .filter((to) => !(allowed[from] ?? []).includes(to))
        .map((to) => `${from} -> ${to}`)
    )
    .sort()

const staleEdges = (
  actual: Map<string, Set<string>>,
  allowed: Record<string, string[]>
) =>
  Object.entries(allowed)
    .flatMap(([from, tos]) =>
      tos
        .filter((to) => !actual.get(from)?.has(to))
        .map((to) => `${from} -> ${to}`)
    )
    .sort()

describe('wirings stay decoupled', () => {
  test('no wire reaches a wire it is not declared to', () => {
    const undeclared = undeclaredEdges(crossWireEdges(), ALLOWED)
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
    const stale = staleEdges(crossWireEdges(), ALLOWED)
    assert.deepEqual(
      stale,
      [],
      `these crossovers are declared but no longer real — delete them:\n${stale.join('\n')}`
    )
  })

  test('the walker finds the edges it is meant to', () => {
    // Guards every test here: a walker that resolved nothing would pass
    // whatever the source imported.
    const edges = crossWireEdges()
    assert.ok(
      edges.get('channel')?.has('http'),
      `expected channel -> http; walker found ${edges.size} wires with edges`
    )
  })
})

describe('core has no runtime import cycles', () => {
  test('no module is part of a runtime import cycle', () => {
    const graph = runtimeGraph()
    const found = cycles(graph.keys(), (file) => graph.get(file) ?? []).map(
      (component) => component.map((file) => relative(srcRoot, file))
    )
    assert.deepEqual(
      found,
      [],
      'these modules import each other at runtime:\n' +
        found.map((component) => component.join(' <-> ')).join('\n') +
        '\nMake one side type-only, move what both need into a leaf module, ' +
        'or reach the other side lazily.'
    )
  })

  test('no two areas reach each other, beyond the known cycles', () => {
    const edges = areaGraph(runtimeGraph())
    const found = cycles(edges.keys(), (area) => edges.get(area) ?? [])
    assert.deepEqual(
      found,
      KNOWN_AREA_CYCLES,
      'the areas of core gained (or lost) a runtime cycle. A lost one is ' +
        'progress: delete it from KNOWN_AREA_CYCLES.'
    )
  })

  test('code outside wirings/ reaches only the wires it is declared to', () => {
    const undeclared = undeclaredEdges(foundationEdges(), FOUNDATION_ALLOWED)
    assert.deepEqual(
      undeclared,
      [],
      'core gained a runtime dependency on a wire:\n' +
        `${undeclared.join('\n')}\n` +
        'The wires build on this code, so the edge is the start of a cycle. ' +
        'Export the value from the wire instead, or make the import type-only.'
    )
  })

  test('every declared foundation edge still exists', () => {
    const stale = staleEdges(foundationEdges(), FOUNDATION_ALLOWED)
    assert.deepEqual(
      stale,
      [],
      `these edges are declared but no longer real — delete them:\n${stale.join('\n')}`
    )
  })
})

describe('@pikku/core/services stays light', () => {
  test(`loads at most ${SERVICES_MODULE_BUDGET} modules`, () => {
    const graph = runtimeGraph()
    const reached = new Set<string>()
    const queue = [join(srcRoot, 'services/index.ts')]
    while (queue.length) {
      const file = queue.pop()!
      if (reached.has(file)) continue
      reached.add(file)
      queue.push(...(graph.get(file) ?? []))
    }

    const wires = [...reached]
      .map((file) => relative(srcRoot, file))
      .filter((file) => file.startsWith(`wirings${sep}`))
    assert.deepEqual(
      wires,
      [],
      '@pikku/core/services loads wire runtime. In-memory implementations ' +
        'of a wire are exported from that wire, e.g. @pikku/core/queue.'
    )
    assert.ok(
      reached.size <= SERVICES_MODULE_BUDGET,
      `@pikku/core/services loads ${reached.size} modules:\n` +
        [...reached].map((file) => relative(srcRoot, file)).join('\n')
    )
  })
})
