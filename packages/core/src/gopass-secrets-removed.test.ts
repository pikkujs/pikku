import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const srcRoot = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(srcRoot, '..')

const collectSourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      return entry.name === 'dist' ? [] : collectSourceFiles(entryPath)
    }
    return /\.(ts|js|mts|cts)$/.test(entry.name) ? [entryPath] : []
  })

describe('gopass secret service removal', () => {
  test('the gopass-secrets module no longer exists', () => {
    assert.equal(
      existsSync(join(srcRoot, 'services/gopass-secrets.ts')),
      false,
      'services/gopass-secrets.ts was reintroduced'
    )
  })

  test('package.json no longer exports ./services/gopass-secrets', () => {
    const packageJson = JSON.parse(
      readFileSync(join(packageRoot, 'package.json'), 'utf-8')
    )
    assert.equal(
      packageJson.exports['./services/gopass-secrets'],
      undefined,
      './services/gopass-secrets export was reintroduced'
    )
  })

  test('no source file references gopass', () => {
    const offenders = collectSourceFiles(srcRoot).filter(
      (file) =>
        file !== fileURLToPath(import.meta.url) &&
        /gopass/i.test(readFileSync(file, 'utf-8'))
    )
    assert.deepEqual(
      offenders,
      [],
      `gopass references found in:\n${offenders.join('\n')}`
    )
  })
})
