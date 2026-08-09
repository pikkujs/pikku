import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname, relative } from 'node:path'

const srcRoot = dirname(fileURLToPath(import.meta.url))
const thisFile = fileURLToPath(import.meta.url)

/**
 * `as any` in a cast position. The word boundary and the following delimiter
 * keep prose such as "as any URL a browser can load" out of the match.
 */
const AS_ANY = /\bas any\b(?!\s+[A-Za-z])/

const collectSourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      return entry.name === 'dist' ? [] : collectSourceFiles(entryPath)
    }
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')
      ? [entryPath]
      : []
  })

describe('core asserts to named types, never to any', () => {
  test('no non-test module casts through `as any`', () => {
    const offenders = collectSourceFiles(srcRoot)
      .filter((file) => file !== thisFile)
      .flatMap((file) =>
        readFileSync(file, 'utf-8')
          .split('\n')
          .flatMap((line, index) =>
            AS_ANY.test(line)
              ? [`${relative(srcRoot, file)}:${index + 1}  ${line.trim()}`]
              : []
          )
      )

    assert.deepEqual(
      offenders,
      [],
      '`as any` discards the target type, so a wrong value passes as readily as ' +
        'a right one. Assert to the type actually wanted — and if the narrowing ' +
        'cannot be expressed, say why in a knowledge note and point at it:\n' +
        offenders.join('\n')
    )
  })

  test('the matcher finds a cast and ignores the prose that reads like one', () => {
    // Guards the test above: a regex that matched nothing would pass forever.
    assert.equal(AS_ANY.test('const x = y as any'), true)
    assert.equal(AS_ANY.test('foo(bar as any)'), true)
    assert.equal(AS_ANY.test('a picture, as any URL a browser can load'), false)
  })
})
