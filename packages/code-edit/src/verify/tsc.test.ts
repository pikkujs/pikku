import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { describe, test } from 'node:test'
import { resolveTsc } from './tsc.js'

/** A project whose node_modules holds a fake `typescript` that ships `binName`. */
const projectWithCompiler = (bin: Record<string, string> | string) => {
  const root = mkdtempSync(join(tmpdir(), 'pikku-tsc-'))
  const pkg = join(root, 'node_modules', 'typescript')
  mkdirSync(join(pkg, 'bin'), { recursive: true })
  writeFileSync(
    join(pkg, 'package.json'),
    JSON.stringify({ name: 'typescript', version: '0.0.0', bin })
  )
  return { root, pkg }
}

describe('resolveTsc', () => {
  test('uses the project’s own typescript, whose binary is tsc', () => {
    const { root, pkg } = projectWithCompiler({ tsc: './bin/tsc' })
    assert.equal(resolveTsc(root), join(pkg, 'bin', 'tsc'))
  })

  test('accepts the TypeScript 6 compat package, whose binary is tsc6', () => {
    const { root, pkg } = projectWithCompiler({ tsc6: './bin/tsc6' })
    assert.equal(resolveTsc(root), join(pkg, 'bin', 'tsc6'))
  })

  test('accepts a package whose bin is a plain string', () => {
    const { root, pkg } = projectWithCompiler('bin/tsc')
    assert.equal(resolveTsc(root), join(pkg, 'bin', 'tsc'))
  })

  test('a project with no compiler falls back to the one this package resolves', () => {
    const root = mkdtempSync(join(tmpdir(), 'pikku-tsc-'))
    assert.match(resolveTsc(root), /bin[\\/]tsc6?$/)
  })

  test('a project compiler that declares no binary falls through to the next candidate', () => {
    const { root, pkg } = projectWithCompiler({})
    const found = resolveTsc(root)
    assert.ok(!found.startsWith(pkg), found)
    assert.match(found, /bin[\\/]tsc6?$/)
  })

  test('with no compiler anywhere it says what to install', () => {
    const empty = mkdtempSync(join(tmpdir(), 'pikku-tsc-'))
    assert.throws(
      () => resolveTsc(empty, createRequire(join(empty, 'noop.cjs'))),
      /install `typescript`/
    )
  })
})
