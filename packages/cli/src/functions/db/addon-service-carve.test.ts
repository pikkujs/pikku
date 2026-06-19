import { strict as assert } from 'assert'
import { describe, test, before, after } from 'node:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'
import { carveServiceTypes } from './addon-service-carve.js'

// Unit test for the service shake. Builds a project whose SingletonServices
// declares the range of service-type shapes the carve must classify:
//   - a self-contained local interface  -> supported (copied + declared)
//   - an inline object type             -> supported (declared inline, no copy)
//   - a type from an external package    -> unsupported (can't copy node_modules)
//   - a type whose file imports a sibling -> unsupported (transitive, not chased)
// plus base + kysely, which are never carved as user services.

const APP_TYPES = `import type { EmailService } from './email-service.js'
import type { Cache } from 'fake-pkg'
import type { Widget } from './widget.js'

export interface SingletonServices {
  logger: unknown
  kysely: unknown
  email: EmailService
  inline: { ping(): void }
  cache: Cache
  widget: Widget
}
`

// Self-contained — no imports to chase.
const EMAIL = `export interface EmailService {
  send(to: string): Promise<void>
}
`

// Imports a sibling relative file -> not safe to copy verbatim.
const WIDGET = `import type { Sub } from './sub.js'
export interface Widget {
  sub: Sub
}
`

const SUB = `export interface Sub {
  x: number
}
`

let dir: string
const file = (name: string) => join(dir, name)

function buildProgram(): ts.Program {
  return ts.createProgram(
    [
      file('application-types.d.ts'),
      file('email-service.ts'),
      file('widget.ts'),
      file('sub.ts'),
    ],
    {
      target: ts.ScriptTarget.ES2021,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      skipLibCheck: true,
      noEmit: true,
    }
  )
}

const REQUIRED = ['logger', 'kysely', 'email', 'inline', 'cache', 'widget']

describe('carveServiceTypes (service shake)', () => {
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'pikku-svc-carve-'))
    writeFileSync(file('application-types.d.ts'), APP_TYPES)
    writeFileSync(file('email-service.ts'), EMAIL)
    writeFileSync(file('widget.ts'), WIDGET)
    writeFileSync(file('sub.ts'), SUB)
  })

  after(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  test('copies a self-contained local service type and declares it', () => {
    const r = carveServiceTypes(buildProgram(), REQUIRED)
    assert.ok(r.members.includes('  email: EmailService'))
    assert.deepEqual(r.imports, [
      "import type { EmailService } from './email-service.js'",
    ])
    assert.equal(r.files['types/email-service.ts'], EMAIL)
  })

  test('declares an inline object type without copying a file', () => {
    const r = carveServiceTypes(buildProgram(), REQUIRED)
    assert.ok(r.members.includes('  inline: { ping(): void }'))
    // inline references no named type, so it adds no import or file
    assert.ok(!Object.keys(r.files).some((f) => f.includes('inline')))
  })

  test('reports external-package and sibling-imported types as unsupported', () => {
    const r = carveServiceTypes(buildProgram(), REQUIRED)
    assert.deepEqual([...r.unsupported].sort(), ['cache', 'widget'])
    assert.ok(!r.members.some((m) => m.includes('cache')))
    assert.ok(!r.members.some((m) => m.includes('widget')))
    // the unsupported widget's type file must NOT be shipped
    assert.ok(!r.files['types/widget.ts'])
  })

  test('never carves base services or kysely as user services', () => {
    const r = carveServiceTypes(buildProgram(), REQUIRED)
    const all = [...r.members, ...r.unsupported].join(' ')
    assert.ok(!/\blogger\b/.test(all))
    assert.ok(!/\bkysely\b/.test(all))
  })
})
