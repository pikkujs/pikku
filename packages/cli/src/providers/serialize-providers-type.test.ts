import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { serializeProvidersType } from './serialize-providers-type.js'

const baseImport = `import type { SingletonServices as BaseSingletonServices } from './base.js'`

describe('serializeProvidersType', () => {
  test('with no services the type is the project own', () => {
    const source = serializeProvidersType({ baseImport, services: [] })
    assert.match(
      source,
      /export type SingletonServices = BaseSingletonServices\n/
    )
  })

  test('each provided key is a required property replacing the base key, sorted, looked up in its service', () => {
    const source = serializeProvidersType({
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
      /Omit<BaseSingletonServices, "a" \| "b" \| "kysely"> & \{\n  "a": Merged<"a", Provided<typeof import\("\.\/a\.js"\)\.a, "a">>\n  "b": Merged<"b", Provided<typeof import\("\.\/b\.js"\)\.b, "b">>\n  "kysely": Merged<"kysely", Provided<typeof import\("\.\/b\.js"\)\.b, "kysely">>\n\}/
    )
  })

  test('a collection is a required key holding the entries of its item type', () => {
    const source = serializeProvidersType({
      baseImport,
      services: [],
      collections: [{ name: 'things', specifier: './c.js', export: 'things' }],
    })
    assert.match(source, /Omit<BaseSingletonServices, "things"> & \{/)
    assert.match(
      source,
      /readonly "things": CollectionEntries<typeof import\("\.\/c\.js"\)\.things>/
    )
    assert.match(source, /readonly ProviderCollectionEntry<Item>\[\]/)
  })

  test('never writes `any`', () => {
    const source = serializeProvidersType({
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

    const leaf = serializeProvidersType({
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
      'services.ts': `import { defineProvider } from './leaf.js'

export const mailer = defineProvider(async ({ logger }) => ({
  mailer: { send: (message: string) => logger.info(message) },
}))

export const inbox = defineProvider({
  dev: ({ mailer }) => ({ inbox: { via: mailer } }),
  deploy: ({ mailer, kysely }) => ({ inbox: { via: mailer, rows: kysely.rows } }),
})

export const cache = defineProvider(({ kysely }) => ({ cache: kysely.rows }))

export const loose = defineProvider(() => ({ loose: JSON.parse('1') as never as unknown as { n: number } }))
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

    test('a conditionally provided key is optional, and a need listed in optional may be undefined', () => {
      const optionalLeaf = serializeProvidersType({
        baseImport,
        services: [
          {
            name: 'maybe',
            provides: ['audit'],
            optionalProvides: ['audit'],
            specifier: './maybe.js',
            export: 'maybe',
          },
          {
            name: 'probe',
            provides: ['probe'],
            specifier: './probe.js',
            export: 'probe',
          },
        ],
      })
      const found = diagnostics({
        'base.ts': files['base.ts'],
        'leaf.ts': optionalLeaf,
        'maybe.ts': `import { defineProvider } from './leaf.js'
export const maybe = defineProvider({
  optional: ['kysely'],
  common: ({ kysely }) => (kysely ? { audit: { write: (_: string) => {} } } : {}),
})
`,
        'probe.ts': `import { defineProvider } from './leaf.js'
export const probe = defineProvider({
  optional: ['audit'],
  common: ({ audit, logger }) => {
    if (audit) audit.write('x')
    // @ts-expect-error audit is optional in the merged type
    audit.write('y')
    logger.info('z')
    return { probe: true }
  },
})
`,
        'use.ts': `import type { InjectedServices, SingletonServices } from './leaf.js'
declare const services: SingletonServices
declare const injected: InjectedServices
export const maybeAudit = services.audit?.write
export const present: boolean = injected.probe
`,
      })
      assert.deepEqual(found, [])
    })

    test('a key the base type declares keeps the base type and gains what the provider returns', () => {
      const wrapLeaf = serializeProvidersType({
        baseImport,
        services: [
          {
            name: 'wrap',
            provides: ['logger'],
            specifier: './wrap.js',
            export: 'wrap',
          },
        ],
      })
      const found = diagnostics({
        'base.ts': files['base.ts'],
        'leaf.ts': wrapLeaf,
        'wrap.ts': `import { defineProvider } from './leaf.js'
export const wrap = defineProvider(() => ({ logger: { info: (_: string) => {}, flush: () => {} } }))
`,
        'use.ts': `import type { SingletonServices } from './leaf.js'
import type { SingletonServices as Base } from './base.js'
declare const services: SingletonServices
export const asBase: Base['logger'] = services.logger
export const flush: () => void = services.logger.flush
`,
      })
      assert.deepEqual(found, [])
    })

    test('a key typed any becomes a visible error type, never a silent any', () => {
      const anyLeaf = serializeProvidersType({
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
        'bad.ts': `import { defineProvider } from './leaf.js'
export const bad = defineProvider(() => ({ bad: JSON.parse('1') as any }))
`,
        'use.ts': `import type { SingletonServices } from './leaf.js'
declare const services: SingletonServices
export const n: number = services.bad
`,
      })
      assert.equal(found.length, 1)
      assert.match(found[0]!, /ProviderKeyIsAny<"bad">/)
    })

    describe('per-request providers', () => {
      const wireLeaf = serializeProvidersType({
        baseImport,
        services: [
          { name: 'a', provides: ['a'], specifier: './a.js', export: 'a' },
        ],
        wireServices: [
          {
            name: 'scope',
            provides: ['requestScope'],
            specifier: './w.js',
            export: 'scope',
          },
          {
            name: 'audited',
            provides: ['auditLog'],
            optionalProvides: ['auditLog'],
            specifier: './w.js',
            export: 'audited',
          },
          {
            name: 'events',
            provides: ['events'],
            specifier: './w.js',
            export: 'events',
          },
        ],
      })
      const wireFiles = {
        'base.ts': `export interface SingletonServices {
  logger: { info(message: string): void }
  audit?: { write(line: string): void }
}
`,
        'leaf.ts': wireLeaf,
        'a.ts': `import { defineProvider } from './leaf.js'
export const a = defineProvider(() => ({ a: { n: 1 } }))
`,
        'w.ts': `import { defineWireProvider } from './leaf.js'

export const scope = defineWireProvider(({ logger, a }, wire) => {
  logger.info(String(a.n))
  return { requestScope: { id: wire.session } }
})

export const audited = defineWireProvider({
  optional: ['audit'],
  common: ({ audit }) => (audit ? { auditLog: { write: audit.write } } : {}),
})

export const events = defineWireProvider({
  optional: ['auditLog'],
  common: ({ requestScope, auditLog }) => {
    // @ts-expect-error auditLog is optional in the merged type
    auditLog.write('x')
    auditLog?.write('x')
    return { events: { scope: requestScope } }
  },
})
`,
        'use.ts': `import type { SingletonServices, WireServices } from './leaf.js'
declare const wire: WireServices
declare const singletons: SingletonServices
export const scope: { id: unknown } = wire.requestScope
export const optional: boolean = wire.auditLog === undefined
export const events: { scope: unknown } = wire.events
// @ts-expect-error a per-request key is not a singleton key
export const leaked = singletons.requestScope
// @ts-expect-error a singleton key is not a per-request key
export const wrong = wire.a
`,
      }

      test('WireServices holds exactly the keys the wire providers provide, optional where returned only sometimes', () => {
        assert.deepEqual(diagnostics(wireFiles), [])
      })

      test('a wire provider cannot destructure a key nothing provides', () => {
        const found = diagnostics({
          ...wireFiles,
          'w.ts': `import { defineWireProvider } from './leaf.js'
export const scope = defineWireProvider(({ ghost }) => ({ requestScope: ghost }))
export const audited = defineWireProvider(() => ({}))
export const events = defineWireProvider(() => ({}))
`,
          'use.ts': '',
        })
        assert.equal(found.length > 0, true)
        assert.match(found.join('\n'), /ghost/)
      })

      test('with no wire providers WireServices is empty', () => {
        assert.match(
          serializeProvidersType({ baseImport, services: [] }),
          /export type WireServices = Record<never, never>/
        )
      })
    })
  })
})
