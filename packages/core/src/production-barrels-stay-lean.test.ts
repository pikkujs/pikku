import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname, resolve, relative } from 'node:path'

const srcRoot = dirname(fileURLToPath(import.meta.url))

/**
 * Statements that only move types. TypeScript erases them, so they cost a
 * production bundle nothing and are deliberately not followed.
 */
const TYPE_ONLY = /^\s*(?:import|export)\s+type\b/

/**
 * The modules a production server must never load by importing a barrel.
 *
 * Each is scenario or virtual-user runtime: `http-personas` signs personas in
 * and reaches the actor-flow conversation runner, which reaches the agent
 * runner. None of it runs in production, and an unbundled Node or Lambda deploy
 * does no tree-shaking — it loads whatever the graph names.
 */
const FORBIDDEN = [
  'services/http-personas.ts',
  'wirings/actor-flow/run-conversation.ts',
  'wirings/workflow/pikku-scenario-service.ts',
]

const resolveSpecifier = (fromFile: string, specifier: string) => {
  const base = resolve(dirname(fromFile), specifier.replace(/\.js$/, ''))
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

/**
 * Every module loaded as a side effect of importing `entry`, following value
 * imports only.
 *
 * A dynamic `await import(...)` is not followed: it does not run at module
 * init, which is the whole reason `pikku-scenario-service` reaches
 * `http-personas` that way.
 */
const runtimeGraph = (entry: string): Set<string> => {
  const seen = new Set<string>()
  const queue = [entry]

  while (queue.length) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)

    for (const line of readFileSync(file, 'utf-8').split('\n')) {
      if (TYPE_ONLY.test(line)) continue
      const specifier = line.match(/\bfrom\s+'(\.[^']+)'/)?.[1]
      if (!specifier) continue
      const target = resolveSpecifier(file, specifier)
      if (target) queue.push(target)
    }
  }

  return seen
}

describe('production barrels stay lean', () => {
  for (const barrel of ['services/index.ts', 'wirings/workflow/index.ts']) {
    test(`@pikku/core ${barrel} does not load scenario runtime`, () => {
      const reached = runtimeGraph(join(srcRoot, barrel))
      const offenders = FORBIDDEN.filter((module) =>
        reached.has(join(srcRoot, module))
      )

      assert.deepEqual(
        offenders,
        [],
        `${barrel} pulls scenario runtime into every app that imports it:\n` +
          `${offenders.join('\n')}\n` +
          `Export the value from '@pikku/core/persona' instead — types may stay here.`
      )
    })
  }

  test('the persona entry point still exports the runtime that moved', async () => {
    const persona = await import('./wirings/persona/index.js')

    for (const name of [
      'createHttpPersonas',
      'HttpPersona',
      'postScenarioJson',
      'readScenarioHttpResponse',
    ]) {
      assert.ok(
        name in persona,
        `@pikku/core/persona no longer exports ${name}; it has to live somewhere`
      )
    }
  })

  test('the graph walker actually reaches things', () => {
    // Guards the test above: a walker that silently resolved nothing would pass
    // no matter what the barrels imported.
    const reached = runtimeGraph(join(srcRoot, 'wirings/persona/index.ts'))
    assert.ok(
      reached.has(join(srcRoot, 'services/http-personas.ts')),
      `walker failed to reach a known value import; reached ${reached.size} files:\n` +
        [...reached].map((f) => relative(srcRoot, f)).join('\n')
    )
  })
})
