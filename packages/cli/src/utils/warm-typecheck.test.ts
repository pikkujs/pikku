import assert from 'node:assert'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import type TS from 'typescript'
import { createWarmChecker } from './warm-typecheck.js'

const ts = createRequire(import.meta.url)('typescript') as typeof TS

const project = () => {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-warm-'))
  mkdirSync(join(dir, 'src'))
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: 'es2022',
        module: 'nodenext',
        moduleResolution: 'nodenext',
        skipLibCheck: true,
        types: [],
      },
      include: ['src'],
    })
  )
  const write = (name: string, body: string) => {
    writeFileSync(join(dir, 'src', name), body)
  }
  const checker = createWarmChecker(
    ts,
    { name: 'functions', tsconfig: join(dir, 'tsconfig.json'), dir },
    dir
  )
  return { dir, write, checker }
}

describe('warm type checker', () => {
  test('reports a position, and clears when the file is fixed', () => {
    const { write, checker } = project()
    write('a.ts', 'export const a: number = 1\n')
    assert.deepEqual(checker.check(), [])

    write('a.ts', "\nexport const a: number = 'x'\n")
    const [found] = checker.check()
    assert.equal(found?.code, 'TS2322')
    assert.equal(found?.file, 'src/a.ts')
    assert.equal(found?.line, 2)
    assert.equal(found?.column, 14)

    write('a.ts', 'export const a: number = 2\n')
    assert.deepEqual(checker.check(), [])
  })

  test('sees a break in a file that imports the one edited', () => {
    const { write, checker } = project()
    write('a.ts', 'export const a = 1\n')
    write('b.ts', "import { a } from './a.js'\nexport const b: number = a\n")
    assert.deepEqual(checker.check(), [])
    write('a.ts', "export const a = 'x'\n")
    assert.deepEqual(
      checker.check().map((d) => d.file),
      ['src/b.ts']
    )
  })

  test('a new file resolves an import that was failing', () => {
    const { write, checker } = project()
    write('b.ts', "import { a } from './a.js'\nexport const b = a\n")
    assert.equal(checker.check()[0]?.code, 'TS2307')
    write('a.ts', 'export const a = 1\n')
    assert.deepEqual(checker.check(), [])
  })

  test('an import outside the tsconfig include resolves once it exists', () => {
    const { dir, write, checker } = project()
    write('b.ts', "import { a } from '../gen/a.js'\nexport const b = a\n")
    assert.equal(checker.check()[0]?.code, 'TS2307')
    mkdirSync(join(dir, 'gen'))
    writeFileSync(join(dir, 'gen', 'a.ts'), 'export const a = 1\n')
    assert.deepEqual(checker.check(), [])
  })

  test('a deleted file breaks whatever imported it', () => {
    const { dir, write, checker } = project()
    write('a.ts', 'export const a = 1\n')
    write('b.ts', "import { a } from './a.js'\nexport const b = a\n")
    assert.deepEqual(checker.check(), [])
    rmSync(join(dir, 'src', 'a.ts'))
    assert.equal(checker.check()[0]?.code, 'TS2307')
  })

  test('a tsconfig change takes effect', () => {
    const { dir, write, checker } = project()
    write('a.ts', 'export const a = (x) => x\n')
    assert.equal(checker.check()[0]?.code, 'TS7006')
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: false,
          noEmit: true,
          target: 'es2022',
          module: 'nodenext',
          moduleResolution: 'nodenext',
          skipLibCheck: true,
          types: [],
        },
        include: ['src'],
      })
    )
    assert.deepEqual(checker.check(), [])
  })

  test('agrees with a fresh checker after a run of edits', () => {
    const { dir, write, checker } = project()
    write('a.ts', 'export type A = { n: number }\n')
    write(
      'b.ts',
      "import type { A } from './a.js'\nexport const b: A = { n: 1 }\n"
    )
    checker.check()
    write('a.ts', 'export type A = { n: string }\n')
    checker.check()
    write('c.ts', "import { b } from './b.js'\nexport const c: string = b.n\n")
    const warm = checker.check()
    const cold = createWarmChecker(
      ts,
      { name: 'functions', tsconfig: join(dir, 'tsconfig.json'), dir },
      dir
    ).check()
    assert.deepEqual(warm, cold)
    assert.equal(warm.length, 1)
  })
})
