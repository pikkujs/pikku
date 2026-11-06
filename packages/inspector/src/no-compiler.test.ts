import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const COMPILER = /^(typescript|ts-json-schema-generator)(\/|$)/

const here = dirname(fileURLToPath(import.meta.url))

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : []
  })

describe('@pikku/inspector', () => {
  test('no source file imports a TypeScript compiler package', () => {
    const offenders = sources(here).filter((file) =>
      [
        ...readFileSync(file, 'utf8').matchAll(
          /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g
        ),
      ].some(([, specifier]) => COMPILER.test(specifier!))
    )
    assert.deepEqual(offenders, [])
  })

  test('declares no compiler dependency', () => {
    const manifest = JSON.parse(
      readFileSync(join(here, '..', 'package.json'), 'utf8')
    )
    const declared = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
    })
    assert.deepEqual(
      declared.filter((name) => COMPILER.test(name)),
      []
    )
  })
})
