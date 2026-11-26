import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { serializeSingletonServicesType } from './serialize-singleton-services-type.js'

const baseImport = `import type { SingletonServices as BaseSingletonServices } from './base.js'`

describe('serializeSingletonServicesType', () => {
  test('with no services the type is the project own', () => {
    const source = serializeSingletonServicesType({ baseImport, services: [] })
    assert.match(
      source,
      /export type SingletonServices = BaseSingletonServices\n/
    )
  })

  test('each provided key is a required property replacing the base key, sorted, looked up in its service', () => {
    const source = serializeSingletonServicesType({
      baseImport,
      services: [
        {
          name: 'b',
          provides: ['kysely', 'b'],
          specifier: './b.js',
          export: 'b',
        },
        { name: 'a', provides: ['a'], specifier: './a.js', export: 'a' },
      ],
    })
    assert.match(
      source,
      /Omit<BaseSingletonServices, "a" \| "b" \| "kysely"> & \{\n  "a": Provided<typeof import\("\.\/a\.js"\)\.a, "a">\n  "b": Provided<typeof import\("\.\/b\.js"\)\.b, "b">\n  "kysely": Provided<typeof import\("\.\/b\.js"\)\.b, "kysely">\n\}/
    )
  })

  test('never writes `any`', () => {
    const source = serializeSingletonServicesType({
      baseImport,
      services: [
        { name: 'a', provides: ['a'], specifier: './a.js', export: 'a' },
      ],
    })
    assert.doesNotMatch(source.replace(/\/\*\*[\s\S]*?\*\//g, ''), /\bany\b/)
  })

  describe('the generated leaf typechecks and resolves types', () => {
    let dir: string
    beforeEach(() => {
      // Inside the package so `@pikku/core` resolves; `.tmp/` is git-ignored.
      const base = join(import.meta.dir, '..', '..', '.tmp')
      mkdirSync(base, { recursive: true })
      dir = mkdtempSync(join(base, 'types-'))
    })
    afterEach(() => rmSync(dir, { recursive: true, force: true }))

    const diagnostics = (files: Record<string, string>) => {
      for (const [name, body] of Object.entries(files)) {
        writeFileSync(join(dir, name), body)
      }
      const program = ts.createProgram(
        Object.keys(files).map((name) => join(dir, name)),
        {
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.NodeNext,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
          types: [],
        }
      )
      return ts
        .getPreEmitDiagnostics(program)
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
    }

    const leaf = serializeSingletonServicesType({
      baseImport,
      services: [
        {
          name: 'mailer',
          provides: ['mailer'],
          specifier: './services.js',
          export: 'mailer',
        },
        {
          name: 'inbox',
          provides: ['inbox'],
          specifier: './services.js',
          export: 'inbox',
        },
        {
          name: 'cache',
          provides: ['cache'],
          specifier: './services.js',
          export: 'cache',
        },
        {
          name: 'loose',
          provides: ['loose'],
          specifier: './services.js',
          export: 'loose',
        },
      ],
    })

    const files = {
      'base.ts': `export interface SingletonServices {
  logger: { info(message: string): void }
  kysely: { rows: number }
}
`,
      'leaf.ts': leaf,
      'services.ts': `import { pikkuService } from './leaf.js'

export const mailer = pikkuService(async ({ logger }) => ({
  mailer: { send: (message: string) => logger.info(message) },
}))

export const inbox = pikkuService({
  dev: ({ mailer }) => ({ inbox: { via: mailer } }),
  deploy: ({ mailer, kysely }) => ({ inbox: { via: mailer, rows: kysely.rows } }),
})

export const cache = pikkuService(({ kysely }) => ({ cache: kysely.rows }))

export const loose = pikkuService(() => ({ loose: JSON.parse('1') as never as unknown as { n: number } }))
`,
      'use.ts': `import type { SingletonServices } from './leaf.js'
declare const services: SingletonServices

export const send: (message: string) => void = services.mailer.send
export const rows: number = services.cache
export const base: { rows: number } = services.kysely
export const via = services.inbox.via.send
// @ts-expect-error a number is not a string
export const wrong: string = services.cache
`,
    }

    test('services destructure each other from the merged type, and every key keeps its type', () => {
      assert.deepEqual(diagnostics(files), [])
    })

    test('a key typed any becomes a visible error type, never a silent any', () => {
      const anyLeaf = serializeSingletonServicesType({
        baseImport,
        services: [
          {
            name: 'bad',
            provides: ['bad'],
            specifier: './bad.js',
            export: 'bad',
          },
        ],
      })
      const found = diagnostics({
        'base.ts': files['base.ts'],
        'leaf.ts': anyLeaf,
        'bad.ts': `import { pikkuService } from './leaf.js'
export const bad = pikkuService(() => ({ bad: JSON.parse('1') as any }))
`,
        'use.ts': `import type { SingletonServices } from './leaf.js'
declare const services: SingletonServices
export const n: number = services.bad
`,
      })
      assert.equal(found.length, 1)
      assert.match(found[0]!, /PikkuServiceKeyIsAny<"bad">/)
    })
  })
})
