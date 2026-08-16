import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const srcRoot = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(srcRoot, '..')

const packageJson = JSON.parse(
  readFileSync(join(packageRoot, 'package.json'), 'utf-8')
)
const expected: Record<string, string[]> = JSON.parse(
  readFileSync(join(srcRoot, 'public-surface.json'), 'utf-8')
)

const subpaths = packageJson.exports as Record<string, string>

/**
 * `exports` entries, with a wildcard subpath replaced by the files it matches.
 *
 * A wildcard subpath would pin a pattern rather than a surface, and a module
 * dropped into the matched directory would appear in the published API without
 * a diff. Expanding it is what keeps every entry point's exports in
 * `public-surface.json` under the same guarantee. `exports` declares none today
 * — `./ecosystem/*` was the last one — and this keeps that from being a
 * silent assumption.
 */
const entryPoints = (): [string, string][] =>
  Object.entries(subpaths).flatMap(([subpath, dist]) => {
    if (!subpath.includes('*')) return [[subpath, dist] as [string, string]]

    const [prefix] = dist.split('*') as [string]
    const directory = resolve(packageRoot, prefix.replace('./dist/', './src/'))
    return readdirSync(directory, { recursive: true, encoding: 'utf-8' })
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
      .map((file) => file.slice(0, -'.ts'.length))
      .sort()
      .map(
        (area) =>
          [subpath.replace('*', area), dist.replace('*', area)] as [
            string,
            string,
          ]
      )
  })

/**
 * Every runtime export reachable through an entry point, keyed by subpath.
 *
 * Types are absent: they are erased before this can see them, so a type-only
 * addition is not pinned here.
 */
const actualSurface = async () => {
  const surface: Record<string, string[]> = {}
  for (const [subpath, dist] of entryPoints()) {
    const src = resolve(packageRoot, dist.replace('./dist/', './src/'))
    const module = await import(pathToFileURL(src).href)
    surface[subpath] = Object.keys(module).sort()
  }
  return surface
}

const REGENERATE =
  'Regenerate with the snippet in public-surface.json.README, and make sure ' +
  'every added name is one @pikku/core means to publish.'

describe('the published surface is the surface we meant to publish', () => {
  test('every export subpath resolves to a source file', () => {
    const missing = entryPoints().filter(([, dist]) => {
      try {
        readFileSync(
          resolve(packageRoot, dist.replace('./dist/', './src/')).replace(
            /\.js$/,
            '.ts'
          )
        )
        return false
      } catch {
        return true
      }
    })

    assert.deepEqual(
      missing.map(([subpath]) => subpath),
      [],
      'package.json exports point at files that do not exist in src'
    )
  })

  test('no entry point gained or lost a runtime export', async () => {
    const actual = await actualSurface()

    assert.deepEqual(
      Object.keys(actual).sort(),
      Object.keys(expected).sort(),
      `the set of export subpaths changed. ${REGENERATE}`
    )

    for (const subpath of Object.keys(expected)) {
      const added = actual[subpath]!.filter(
        (name) => !expected[subpath]!.includes(name)
      )
      const removed = expected[subpath]!.filter(
        (name) => !actual[subpath]!.includes(name)
      )

      assert.deepEqual(
        { added, removed },
        { added: [], removed: [] },
        `'${subpath}' changed its public exports.\n` +
          (added.length ? `  added:   ${added.join(', ')}\n` : '') +
          (removed.length ? `  removed: ${removed.join(', ')}\n` : '') +
          `${REGENERATE}`
      )
    }
  })

  test('the wildcard re-exports have not widened past their barrels', async () => {
    // `errors/index.ts` and `dev/hot-reload.ts` re-export with `export *`, so a
    // new export in the wrapped module is published without anyone editing an
    // entry point. This pins the two that are reachable publicly.
    const actual = await actualSurface()

    assert.equal(
      actual['./errors']!.every(
        (name) => name.endsWith('Error') || name.startsWith('addError')
      ),
      true,
      `'@pikku/core/errors' exports something that is not an error or an error ` +
        `registrar: ${actual['./errors']!.filter((n) => !n.endsWith('Error') && !n.startsWith('addError')).join(', ')}`
    )
  })
})
