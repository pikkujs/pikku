import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '.pikku'
)
const customTypesFile = join(outDir, 'pikku-custom-types.gen.d.ts')

const generatedTypeScript = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return generatedTypeScript(path)
    return /\.tsx?$/.test(entry) ? [path] : []
  })

const declaredTypeNames = (content: string): string[] =>
  Array.from(
    content.matchAll(/^export type (\w+) = /gm),
    ([, name]) => name ?? ''
  )

describe('shared custom types verifier', () => {
  test('the custom types are generated into one shared file', () => {
    assert.ok(
      existsSync(customTypesFile),
      `${customTypesFile} was not generated`
    )
    const names = declaredTypeNames(readFileSync(customTypesFile, 'utf-8'))
    assert.ok(names.includes('FormatPostalAddressInput'))
  })

  test('no other generated file carries its own copy of a custom type', () => {
    const shared = readFileSync(customTypesFile, 'utf-8')
    const customNames = new Set(declaredTypeNames(shared))
    const redeclared: string[] = []
    for (const file of generatedTypeScript(outDir)) {
      if (file === customTypesFile) continue
      const content = readFileSync(file, 'utf-8')
      for (const [, name = '', body = ''] of content.matchAll(
        /^export type (\w+) = (.*)$/gm
      )) {
        if (customNames.has(name) && !body.startsWith('__PikkuCustomTypes.')) {
          redeclared.push(`${relative(outDir, file)}: ${name}`)
        }
      }
    }
    assert.deepEqual(redeclared, [])
  })

  test('every generated import is relative or a package specifier', () => {
    const absolute: string[] = []
    for (const file of generatedTypeScript(outDir)) {
      const content = readFileSync(file, 'utf-8')
      for (const [, specifier = ''] of content.matchAll(
        /^import [^'"]* from ['"]([^'"]+)['"]/gm
      )) {
        if (specifier.startsWith('/') || /^[A-Za-z]:[\\/]/.test(specifier)) {
          absolute.push(`${relative(outDir, file)}: ${specifier}`)
        }
      }
    }
    assert.deepEqual(absolute, [])
  })

  test('the shared file imports the source types its custom types use', () => {
    assert.match(
      readFileSync(customTypesFile, 'utf-8'),
      /import type \{ PostalAddress \} from '\.\.\/src\/functions\/custom-types\/postal-address\.types\.js'/
    )
  })
})
