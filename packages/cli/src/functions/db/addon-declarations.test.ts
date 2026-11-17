import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  computeDeclaredTablesDrift,
  generateMigrations,
  migrateAndCodegen,
  resolveDb,
  type ResolvedDb,
} from './local-db.js'
import {
  addonDeclarations,
  addonTablePrefix,
  loadMergedDeclaration,
  mergeDeclarations,
  wiredAddons,
  writeAddonDeclaration,
  type AddonDeclaration,
} from './addon-declarations.js'
import { ensureDbTypes } from './ensure-db-types.js'
import { parseDeclaration } from './table-declaration.js'

let root: string
const logger = { error: (msg: string) => assert.fail(msg) }

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pikku-addon-tables-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** An addon declaring `labels_item` (a unique name, an annotated email, a bounded count). */
const LABELS = {
  labelsItem: {
    columns: {
      id: { type: 'key', primaryKey: true },
      name: { type: 'text', required: true, unique: true },
      owner: { type: 'text', format: 'email', security: 'pii' },
      weight: { type: 'integer', min: 0, max: 10 },
    },
  },
}

/** Install a package into the fixture that publishes the given artifact. */
const publish = (pkg: string, artifact: unknown, into: string = root) => {
  const dir = join(into, 'node_modules', pkg)
  mkdirSync(join(dir, '.pikku', 'db'), { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: pkg, version: '1.0.0' })
  )
  writeFileSync(
    join(dir, '.pikku', 'db', 'pikku-db-meta.gen.json'),
    JSON.stringify(artifact)
  )
}

const wire = (name: string, extra: Partial<AddonDeclaration> = {}) => [
  { package: `addon-${name}`, name, ...extra },
]

const writeTables = (dir: string, source: string) => {
  mkdirSync(join(dir, 'db'), { recursive: true })
  writeFileSync(join(dir, 'db', 'tables.ts'), source)
}

describe('wiredAddons', () => {
  test('maps the inspector state, name first', () => {
    const state = {
      rpc: {
        wireAddonDeclarations: new Map([
          ['labels', { package: 'addon-labels', remote: true, file: '/a.ts' }],
        ]),
      },
    }
    assert.deepEqual(wiredAddons(state), [
      { package: 'addon-labels', remote: true, file: '/a.ts', name: 'labels' },
    ])
  })
})

describe('publishing an addon declaration', () => {
  test('writes the declaration as plain JSON', async () => {
    writeTables(root, `export const tables = ${JSON.stringify(LABELS)}\n`)
    const { file, tables } = await writeAddonDeclaration(
      root,
      join(root, 'out')
    )
    assert.deepEqual(tables, ['labelsItem'])
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), LABELS)
  })

  test('an addon with no tables still publishes, so the file always ships', async () => {
    const { file, tables } = await writeAddonDeclaration(
      root,
      join(root, 'out')
    )
    assert.deepEqual(tables, [])
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), {})
  })

  test('an addon that still ships SQL without declaring tables is refused', async () => {
    mkdirSync(join(root, 'db', 'postgres'), { recursive: true })
    await assert.rejects(
      writeAddonDeclaration(root, join(root, 'out')),
      /db\/postgres but no db\/tables\.ts/
    )
    assert.equal(existsSync(join(root, 'out')), false)
  })

  test('a declareOnly table is refused in an addon', async () => {
    writeTables(
      root,
      `export const tables = { labelsUser: { declareOnly: true, columns: { id: { type: 'key', primaryKey: true } } } }\n`
    )
    await assert.rejects(
      writeAddonDeclaration(root, join(root, 'out')),
      /declareOnly is not allowed in an addon/
    )
  })

  test('an invalid declaration stops the export', async () => {
    writeTables(
      root,
      `export const tables = { labelsItem: { columns: { id: { type: 'nope' } } } }\n`
    )
    await assert.rejects(writeAddonDeclaration(root, join(root, 'out')))
  })
})

describe('reading what wired addons publish', () => {
  test('a wired addon yields its declaration', () => {
    publish('addon-labels', LABELS)
    const [one] = addonDeclarations(root, wire('labels'))
    assert.deepEqual(Object.keys(one!.declaration.schema.tables), [
      'labelsItem',
    ])
  })

  test('an addon installed only in the workspace package that wires it is found', () => {
    const member = join(root, 'packages', 'functions')
    mkdirSync(join(member, 'src'), { recursive: true })
    writeFileSync(join(member, 'package.json'), JSON.stringify({ name: 'f' }))
    publish('addon-labels', LABELS, member)
    const found = addonDeclarations(
      root,
      wire('labels', { file: join(member, 'src', 'addons.wiring.ts') })
    )
    assert.equal(found.length, 1)
  })

  test('a remote addon contributes nothing: its tables live on the host', () => {
    publish('addon-labels', LABELS)
    assert.deepEqual(
      addonDeclarations(root, wire('labels', { remote: true })),
      []
    )
  })

  test('an addon wired twice contributes once', () => {
    publish('addon-labels', LABELS)
    const twice = [...wire('labels'), { package: 'addon-labels', name: 'more' }]
    assert.equal(addonDeclarations(root, twice).length, 1)
  })

  test('an addon that publishes no tables is not a finding', () => {
    publish('addon-labels', {})
    const [one] = addonDeclarations(root, wire('labels'))
    assert.deepEqual(one!.declaration.schema.tables, {})
  })

  test('an addon whose artifact never shipped fails loudly', () => {
    const dir = join(root, 'node_modules', 'addon-labels')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      '{"name":"addon-labels","version":"1.0.0"}'
    )
    assert.throws(
      () => addonDeclarations(root, wire('labels')),
      /addon-labels.*pikku-db-meta\.gen\.json/s
    )
  })

  test('a remote addon with no artifact is still silent', () => {
    const dir = join(root, 'node_modules', 'addon-labels')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      '{"name":"addon-labels","version":"1.0.0"}'
    )
    assert.deepEqual(
      addonDeclarations(root, wire('labels', { remote: true })),
      []
    )
  })

  test('an unparseable artifact names the file it could not read', () => {
    publish('addon-labels', {})
    writeFileSync(
      join(
        root,
        'node_modules',
        'addon-labels',
        '.pikku',
        'db',
        'pikku-db-meta.gen.json'
      ),
      '{ not json'
    )
    assert.throws(
      () => addonDeclarations(root, wire('labels')),
      /addon-labels.*pikku-db-meta\.gen\.json/s
    )
  })

  test('an artifact in the old per-dialect shape is refused: rebuild or upgrade the addon', () => {
    publish('addon-labels', {
      sqlite: { sql: 'CREATE TABLE labels_item (id TEXT);', tables: {} },
    })
    assert.throws(
      () => addonDeclarations(root, wire('labels')),
      /Rebuild or upgrade the addon/
    )
  })

  test('a declaration that does not check names the addon', () => {
    publish('addon-labels', {
      labelsItem: { columns: { id: { type: 'nope' } } },
    })
    assert.throws(
      () => addonDeclarations(root, wire('labels')),
      /the 'addon-labels' addon/
    )
  })

  test('declareOnly in a published declaration is refused', () => {
    publish('addon-labels', {
      labelsUser: {
        declareOnly: true,
        columns: { id: { type: 'key', primaryKey: true } },
      },
    })
    assert.throws(() => addonDeclarations(root, wire('labels')), /declareOnly/)
  })

  test('a table without the addon prefix is an error', () => {
    publish('addon-labels', { items: LABELS.labelsItem })
    assert.throws(
      () => addonDeclarations(root, wire('labels')),
      /without its prefix 'labels_': items/
    )
  })

  test('the prefix is the wired name with separators folded to underscores', () => {
    assert.equal(addonTablePrefix('invoice-tracker'), 'invoice_tracker_')
  })
})

describe('merging declarations', () => {
  const app = (tables: object) => parseDeclaration(tables as any, 'app')
  const addon = (name: string, tables: object) => ({
    addon: { package: `addon-${name}`, name },
    declaration: parseDeclaration(tables as any, name),
  })

  test('an addon with no tables leaves the app declaration as it was', () => {
    const mine = app({
      box: { columns: { id: { type: 'key', primaryKey: true } } },
    })
    assert.equal(mergeDeclarations(mine, [addon('labels', {})]), mine)
    assert.equal(mergeDeclarations(null, []), null)
    assert.deepEqual(
      mergeDeclarations(null, [addon('labels', {})])!.schema.tables,
      {}
    )
  })

  test('addon tables, annotations and constraints join the app’s', () => {
    const merged = mergeDeclarations(
      app({ box: { columns: { id: { type: 'key', primaryKey: true } } } }),
      [addon('labels', LABELS)]
    )!
    assert.deepEqual(Object.keys(merged.schema.tables), ['box', 'labelsItem'])
    assert.deepEqual(merged.annotations['labels_item'], {
      owner: { format: 'email', security: 'pii' },
      weight: { min: 0, max: 10 },
    })
  })

  test('a table declared by the app and an addon is refused', () => {
    assert.throws(
      () =>
        mergeDeclarations(app({ labelsItem: LABELS.labelsItem }), [
          addon('labels', LABELS),
        ]),
      /labels_item is declared by both db\/tables\.ts and the 'addon-labels' addon/
    )
  })

  test('a table declared by two addons is refused', () => {
    assert.throws(
      () => mergeDeclarations(null, [addon('a', LABELS), addon('b', LABELS)]),
      /declared by both the 'addon-a' addon and the 'addon-b' addon/
    )
  })

  const linked = (to: string) =>
    addon('labels', {
      labelsItem: {
        columns: {
          id: { type: 'key', primaryKey: true },
          boxId: { type: 'key', references: to },
        },
      },
    })

  test('an addon table may reference a table the app declares', () => {
    const merged = mergeDeclarations(
      app({ box: { columns: { id: { type: 'key', primaryKey: true } } } }),
      [linked('box.id')]
    )
    assert.deepEqual(Object.keys(merged!.schema.tables), ['box', 'labelsItem'])
  })

  test('a reference to a column the merged declaration lacks is refused', () => {
    assert.throws(
      () =>
        mergeDeclarations(
          app({ box: { columns: { id: { type: 'key', primaryKey: true } } } }),
          [linked('box.nope')]
        ),
      /The merged table declaration is invalid/
    )
  })
})

/** The `generate`/`migrate`/`check` path on a real sqlite database. */
describe('the app creates what its addons declare', () => {
  const resolved = (): ResolvedDb =>
    resolveDb({ sqliteDb: 'dev.db' }, root, join(root, '.pikku'))!
  const generate = (addons: AddonDeclaration[], allowDestructive = false) =>
    generateMigrations(resolved(), root, ['src'], logger, addons, new Set(), {
      allowDestructive,
    })
  beforeEach(() =>
    writeTables(
      root,
      `export const tables = { box: { columns: { id: { type: 'key', primaryKey: true } } } }\n`
    )
  )
  const sql = (r: { written: { file: string }[] }) =>
    r.written.map((w) => readFileSync(w.file, 'utf8')).join('\n')

  test('a new addon table is created, then covered', async () => {
    publish('addon-labels', LABELS)
    const first = await generate(wire('labels'))
    assert.deepEqual(first.refusals, [])
    assert.match(sql(first), /create table "labels_item"/)
    assert.match(sql(first), /^-- pikku:tables .*labels_item/m)
    const again = await generate(wire('labels'))
    assert.deepEqual(
      again.written.filter((w) => w.source === 'app-tables'),
      []
    )
  })

  test('migrate and check see the addon tables as declared, not as dropped', async () => {
    publish('addon-labels', LABELS)
    await generate(wire('labels'))
    await migrateAndCodegen(resolved(), { addons: wire('labels') })

    const withAddons = await computeDeclaredTablesDrift(
      resolved(),
      wire('labels')
    )
    assert.equal(withAddons.pending, false)
    assert.deepEqual(withAddons.destructive, [])

    // Left out, the same tables read as removed from the declaration.
    const without = await computeDeclaredTablesDrift(resolved())
    assert.match(without.destructive.join(), /DROP TABLE labels_item/)
  })

  test('a column an addon adds later is added', async () => {
    publish('addon-labels', LABELS)
    await generate(wire('labels'))
    publish('addon-labels', {
      labelsItem: {
        columns: { ...LABELS.labelsItem.columns, color: { type: 'text' } },
      },
    })
    const next = await generate(wire('labels'))
    assert.match(
      sql(next),
      /ALTER TABLE "labels_item" ADD COLUMN "color" text;/
    )
  })

  test('an addon dropping a table is refused without --allowDestructive', async () => {
    publish('addon-labels', LABELS)
    await generate(wire('labels'))
    publish('addon-labels', {})
    const refused = await generate(wire('labels'))
    assert.deepEqual(
      refused.written.filter((w) => w.source === 'app-tables'),
      []
    )
    assert.match(
      refused.destructive.map((d) => d.what).join(),
      /DROP TABLE labels_item/
    )

    const approved = await generate(wire('labels'), true)
    assert.match(sql(approved), /DROP TABLE "labels_item"/)
  })

  test('an addon dropping its last table, with no db/tables.ts, waits for approval too', async () => {
    rmSync(join(root, 'db', 'tables.ts'))
    publish('addon-labels', LABELS)
    await generate(wire('labels'))
    publish('addon-labels', {})
    const refused = await generate(wire('labels'))
    assert.deepEqual(refused.refusals, [])
    assert.match(
      refused.destructive.map((d) => d.what).join(),
      /DROP TABLE labels_item/
    )
    assert.match(
      sql(await generate(wire('labels'), true)),
      /DROP TABLE "labels_item"/
    )
  })

  test('addons with no tables and nothing recorded write nothing', async () => {
    rmSync(join(root, 'db', 'tables.ts'))
    publish('addon-labels', {})
    const result = await generate(wire('labels'))
    assert.deepEqual(
      result.written.filter((w) => w.source === 'app-tables'),
      []
    )
  })

  test('an addon dropping a column is refused without --allowDestructive', async () => {
    publish('addon-labels', LABELS)
    await generate(wire('labels'))
    const { weight, ...rest } = LABELS.labelsItem.columns
    publish('addon-labels', { labelsItem: { columns: rest } })
    const refused = await generate(wire('labels'))
    assert.match(refused.destructive.map((d) => d.what).join(), /weight/)
  })

  test('a remote addon contributes nothing', async () => {
    publish('addon-labels', LABELS)
    const result = await generate(wire('labels', { remote: true }))
    assert.doesNotMatch(sql(result), /labels_item/)
  })

  test('an unprefixed addon table stops generate', async () => {
    publish('addon-labels', { items: LABELS.labelsItem })
    await assert.rejects(generate(wire('labels')), /without its prefix/)
  })

  test('tables an old addon migration already created are adopted', async () => {
    mkdirSync(join(root, 'db', 'sqlite'), { recursive: true })
    writeFileSync(
      join(root, 'db', 'sqlite', '0001-labels.sql'),
      `CREATE TABLE labels_item (\n  id TEXT PRIMARY KEY NOT NULL,\n  name TEXT NOT NULL,\n  owner TEXT,\n  weight INTEGER\n);\n\nCREATE UNIQUE INDEX labels_item_name_unique ON labels_item (name);\n`
    )
    publish('addon-labels', LABELS)
    const result = await generate(wire('labels'))
    assert.deepEqual(result.refusals, [])
    assert.deepEqual(result.destructive, [])
    assert.doesNotMatch(sql(result), /create table "labels_item"/)
  })

  test('addon column security, format and bounds reach the sidecar and Zod after migrate', async () => {
    publish('addon-labels', LABELS)
    await generate(wire('labels'))
    await migrateAndCodegen(resolved(), { addons: wire('labels') })

    const sidecar = JSON.parse(
      readFileSync(join(root, 'db', 'annotations.gen.json'), 'utf8')
    )
    assert.deepEqual(sidecar.labels_item.owner, {
      format: 'email',
      security: 'pii',
    })
    assert.deepEqual(sidecar.labels_item.weight, { min: 0, max: 10 })
    const zod = readFileSync(join(root, '.pikku', 'db', 'zod.gen.ts'), 'utf8')
    assert.match(zod, /email/)
    assert.match(zod, /\.max\(10\)/)
    assert.match(
      readFileSync(join(root, '.pikku', 'db', 'schema.gen.ts'), 'utf8'),
      /labels_item|labelsItem/
    )
  })

  test('ensureDbTypes has no addon list: it writes the sidecar from the app alone until the next db migrate', async () => {
    publish('addon-labels', LABELS)
    await generate(wire('labels'))
    await migrateAndCodegen(resolved(), { addons: wire('labels') })
    const sidecar = join(root, 'db', 'annotations.gen.json')
    rmSync(join(root, '.pikku', 'db', 'schema.gen.ts'))

    const outcome = await ensureDbTypes(root, join(root, '.pikku'), undefined, {
      sqliteDb: 'dev.db',
    })
    assert.equal(outcome, 'generated')
    assert.equal(readFileSync(sidecar, 'utf8').includes('labels_item'), false)

    await migrateAndCodegen(resolved(), { addons: wire('labels') })
    assert.equal(readFileSync(sidecar, 'utf8').includes('labels_item'), true)
  })

  test('loadMergedDeclaration is the app’s declaration when no addon is wired', async () => {
    writeTables(
      root,
      `export const tables = { box: { columns: { id: { type: 'key', primaryKey: true } } } }\n`
    )
    const merged = await loadMergedDeclaration(root, [])
    assert.deepEqual(Object.keys(merged!.schema.tables), ['box'])
  })
})
