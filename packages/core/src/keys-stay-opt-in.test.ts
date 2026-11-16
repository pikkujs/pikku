import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const srcRoot = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(srcRoot, '..')
const keysDir = join(srcRoot, 'keys')

const pkg = JSON.parse(
  readFileSync(join(packageRoot, 'package.json'), 'utf-8')
) as {
  exports: Record<string, string>
  sideEffects: string[]
}

const isKeysSubpath = (subpath: string) =>
  subpath === './keys' || subpath.startsWith('./keys/')

const sourceOf = (dist: string) =>
  join(packageRoot, dist.replace('./dist/', 'src/').replace(/\.js$/, '.ts'))

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return entry.name === 'dist' || entry.name === 'node_modules'
        ? []
        : sourceFiles(path)
    }
    return entry.name.endsWith('.ts') ? [path] : []
  })

const insideKeys = (file: string) =>
  file === keysDir || file.startsWith(keysDir + sep)

/**
 * The key service is opt-in. It is reachable by its own subpaths and by
 * nothing else, so an app that never imports `@pikku/core/keys` bundles none
 * of it, and the dependency runs one way: keys -> core internals.
 */
describe('@pikku/core/keys is reachable only through its own subpaths', () => {
  test('no core source file outside keys/ imports it', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(srcRoot)) {
      if (insideKeys(file) || file === fileURLToPath(import.meta.url)) continue
      const text = readFileSync(file, 'utf-8')
      for (const match of text.matchAll(
        /(?:from|import\()\s*['"]([^'"]+)['"]/g
      )) {
        const specifier = match[1]!
        const reachesKeys =
          specifier === '@pikku/core/keys' ||
          specifier.startsWith('@pikku/core/keys/') ||
          (specifier.startsWith('.') &&
            insideKeys(resolve(dirname(file), specifier)))
        if (reachesKeys) {
          offenders.push(`${relative(srcRoot, file)}: ${specifier}`)
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      'core must not import the key service; it is exported only by ./keys and ./keys/file'
    )
  })

  test('no other export subpath bundles a keys module', async () => {
    const offenders: string[] = []
    for (const [subpath, dist] of Object.entries(pkg.exports)) {
      if (isKeysSubpath(subpath) || !dist.startsWith('./dist/')) continue
      const result = await build({
        entryPoints: [sourceOf(dist)],
        bundle: true,
        write: false,
        metafile: true,
        platform: 'neutral',
        format: 'esm',
        logLevel: 'silent',
        packages: 'external',
      })
      for (const input of Object.keys(result.metafile.inputs)) {
        if (insideKeys(resolve(packageRoot, input))) {
          offenders.push(`${subpath} -> ${input}`)
        }
      }
    }
    assert.deepEqual(offenders, [])
  })

  test('bundling the root entry pulls in no keys module', async () => {
    assert.equal(pkg.exports['.'], './dist/bootstrap-compat/root.js')
    const result = await build({
      entryPoints: [sourceOf(pkg.exports['.']!)],
      bundle: true,
      write: false,
      metafile: true,
      platform: 'neutral',
      format: 'esm',
      logLevel: 'silent',
      packages: 'external',
    })
    const inputs = Object.keys(result.metafile.inputs)
    assert.ok(inputs.length >= 1, 'the root bundle resolved no module')
    assert.deepEqual(
      inputs.filter((input) => insideKeys(resolve(packageRoot, input))),
      []
    )
  })

  test('the bundle check sees keys when it is asked for', async () => {
    // Guards the checks above: a bundler that never resolved anything would
    // find no keys module under any entry.
    const result = await build({
      entryPoints: [sourceOf(pkg.exports['./keys']!)],
      bundle: true,
      write: false,
      metafile: true,
      platform: 'neutral',
      format: 'esm',
      logLevel: 'silent',
      packages: 'external',
    })
    const inputs = Object.keys(result.metafile.inputs).map((input) =>
      resolve(packageRoot, input)
    )
    assert.ok(inputs.some(insideKeys))
    assert.ok(inputs.some((input) => !insideKeys(input)))
  })

  test('only the two keys subpaths export it, and neither is a side-effect module', () => {
    assert.deepEqual(Object.keys(pkg.exports).filter(isKeysSubpath), [
      './keys',
      './keys/file',
    ])
    assert.deepEqual(
      pkg.sideEffects.filter((entry) => entry.startsWith('./dist/keys/')),
      [],
      'keys modules do nothing on import, so a bundler may drop them freely'
    )
  })
})
