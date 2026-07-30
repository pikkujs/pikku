import assert from 'node:assert'
import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, test } from 'node:test'
import { saveSchemas } from './serialize-schemas.js'
import type { CLILogger } from '../services/cli-logger.service.js'

const noopLogger = {
  info: () => {},
  error: () => {},
  debug: () => {},
  warn: () => {},
} as unknown as CLILogger

const dirs: string[] = []

async function makeDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pikku-schemas-'))
  dirs.push(dir)
  return dir
}

async function seedExistingSchema(parent: string, name: string) {
  await mkdir(join(parent, 'schemas'), { recursive: true })
  await writeFile(
    join(parent, 'schemas', `${name}.schema.json`),
    JSON.stringify({
      type: 'object',
      properties: { stale: { type: 'string' } },
    }),
    'utf-8'
  )
}

const listSchemaFiles = async (parent: string) =>
  (await readdir(join(parent, 'schemas'))).sort()

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe('saveSchemas', () => {
  test('a byte-identical schema is left untouched, and no temp file survives', async () => {
    // Generated files are read while they are generated: `pikku scenario run
    // --spawn` bundles the registers while the dev server it spawned regenerates
    // them. A rewrite is a window in which a reader can see a truncated file, so
    // an unchanged schema must not be rewritten at all — and the rewrite that
    // does happen goes through a temp file that must never be left behind for
    // the register (or the prune) to trip over.
    const parent = await makeDir()
    const schema = { KeptInput: { type: 'object', properties: {} } }

    await saveSchemas(noopLogger, parent, schema, new Set(['KeptInput']), true)
    const first = await stat(join(parent, 'schemas', 'KeptInput.schema.json'))

    await saveSchemas(noopLogger, parent, schema, new Set(['KeptInput']), true)
    const second = await stat(join(parent, 'schemas', 'KeptInput.schema.json'))

    assert.equal(
      second.mtimeMs,
      first.mtimeMs,
      'unchanged schema was rewritten'
    )
    assert.deepEqual(await listSchemaFiles(parent), ['KeptInput.schema.json'])
  })

  test('a changed schema is replaced, leaving no temp file', async () => {
    const parent = await makeDir()

    await saveSchemas(
      noopLogger,
      parent,
      { KeptInput: { type: 'object', properties: {} } },
      new Set(['KeptInput']),
      true
    )
    await saveSchemas(
      noopLogger,
      parent,
      {
        KeptInput: {
          type: 'object',
          properties: { title: { type: 'string' } },
        },
      },
      new Set(['KeptInput']),
      true
    )

    assert.deepEqual(await listSchemaFiles(parent), ['KeptInput.schema.json'])
    const written = JSON.parse(
      await readFile(join(parent, 'schemas', 'KeptInput.schema.json'), 'utf-8')
    )
    assert.deepEqual(Object.keys(written.properties), ['title'])
  })

  test('removes schema files that are no longer required', async () => {
    const parent = await makeDir()
    await seedExistingSchema(parent, 'CreateClassInput')
    await seedExistingSchema(parent, 'DeletedFunctionInput')

    await saveSchemas(
      noopLogger,
      parent,
      {
        CreateClassInput: {
          type: 'object',
          properties: { title: { type: 'string' } },
        },
      },
      new Set(['CreateClassInput']),
      true
    )

    assert.deepEqual(await listSchemaFiles(parent), [
      'CreateClassInput.schema.json',
    ])
  })

  test('the surviving file is the one this run generated, not the stale copy', async () => {
    const parent = await makeDir()
    await seedExistingSchema(parent, 'CreateClassInput')

    await saveSchemas(
      noopLogger,
      parent,
      {
        CreateClassInput: {
          type: 'object',
          properties: { title: { type: 'string' } },
        },
      },
      new Set(['CreateClassInput']),
      true
    )

    const written = JSON.parse(
      await readFile(
        join(parent, 'schemas', 'CreateClassInput.schema.json'),
        'utf-8'
      )
    )
    assert.deepEqual(Object.keys(written.properties), ['title'])
  })

  test('every schema file is registered in register.gen.ts', async () => {
    const parent = await makeDir()
    await seedExistingSchema(parent, 'OrphanInput')

    await saveSchemas(
      noopLogger,
      parent,
      { KeptInput: { type: 'object', properties: {} } },
      new Set(['KeptInput']),
      true
    )

    // The invariant the fix exists to hold: a file on disk that register.gen.ts does
    // not import is read as authoritative by tooling and silently contradicts the
    // running server.
    const register = await readFile(join(parent, 'register.gen.ts'), 'utf-8')
    for (const file of await listSchemaFiles(parent)) {
      const name = file.replace('.schema.json', '')
      assert.ok(
        register.includes(`addSchema('${name}'`),
        `${file} is on disk but never registered`
      )
    }
  })

  test('clears every schema file when nothing is required any more', async () => {
    const parent = await makeDir()
    await seedExistingSchema(parent, 'GoneInput')

    await saveSchemas(noopLogger, parent, {}, new Set(), true)

    assert.deepEqual(await listSchemaFiles(parent), [])
    // The register has to be rewritten too, not just emptied of files: the
    // scenario bootstrap imports it unconditionally, so a project whose last
    // scenario was deleted must stop registering the schemas it used to have.
    const register = await readFile(join(parent, 'register.gen.ts'), 'utf-8')
    assert.equal(register.includes('addSchema('), false)
  })

  test('reports a schema it could not delete instead of failing the build', async () => {
    const parent = await makeDir()
    // A directory cannot be unlink()ed, so this stands in for any undeletable entry.
    await mkdir(join(parent, 'schemas', 'Undeletable.schema.json'), {
      recursive: true,
    })

    const errors: string[] = []
    const logger = {
      ...noopLogger,
      error: (m: string) => errors.push(m),
    } as CLILogger

    await saveSchemas(
      logger,
      parent,
      { KeptInput: { type: 'object', properties: {} } },
      new Set(['KeptInput']),
      true
    )

    assert.ok(
      errors.some((m) => m.includes('Undeletable.schema.json')),
      `stale schema left on disk without a word about it: ${JSON.stringify(errors)}`
    )
  })

  test('keeps a `false` schema, which is valid and rejects everything', async () => {
    const parent = await makeDir()

    await saveSchemas(
      noopLogger,
      parent,
      { DenyAll: false },
      new Set(['DenyAll']),
      true
    )

    assert.deepEqual(await listSchemaFiles(parent), ['DenyAll.schema.json'])
    const register = await readFile(join(parent, 'register.gen.ts'), 'utf-8')
    assert.ok(register.includes(`addSchema('DenyAll'`))
  })

  test('leaves an unrelated file in the schemas dir alone', async () => {
    const parent = await makeDir()
    await mkdir(join(parent, 'schemas'), { recursive: true })
    await writeFile(
      join(parent, 'schemas', 'notes.md'),
      'not codegen output',
      'utf-8'
    )

    await saveSchemas(
      noopLogger,
      parent,
      { KeptInput: { type: 'object', properties: {} } },
      new Set(['KeptInput']),
      true
    )

    assert.deepEqual(await listSchemaFiles(parent), [
      'KeptInput.schema.json',
      'notes.md',
    ])
  })
})
