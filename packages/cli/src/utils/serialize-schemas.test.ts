import assert from 'node:assert'
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
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

/** Drop a schema file that a previous codegen run would have left behind. */
async function seedExistingSchema(parent: string, name: string) {
  await mkdir(join(parent, 'schemas'), { recursive: true })
  await writeFile(
    join(parent, 'schemas', `${name}.schema.json`),
    JSON.stringify({ type: 'object', properties: { stale: { type: 'string' } } }),
    'utf-8'
  )
}

const listSchemaFiles = async (parent: string) =>
  (await readdir(join(parent, 'schemas'))).sort()

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('saveSchemas', () => {
  test('removes schema files that are no longer required', async () => {
    const parent = await makeDir()
    // Two schemas from an earlier run; this run only still needs one of them.
    await seedExistingSchema(parent, 'CreateClassInput')
    await seedExistingSchema(parent, 'DeletedFunctionInput')

    await saveSchemas(
      noopLogger,
      parent,
      { CreateClassInput: { type: 'object', properties: { title: { type: 'string' } } } },
      new Set(['CreateClassInput']),
      true
    )

    assert.deepEqual(await listSchemaFiles(parent), ['CreateClassInput.schema.json'])
  })

  test('the surviving file is the one this run generated, not the stale copy', async () => {
    const parent = await makeDir()
    await seedExistingSchema(parent, 'CreateClassInput')

    await saveSchemas(
      noopLogger,
      parent,
      { CreateClassInput: { type: 'object', properties: { title: { type: 'string' } } } },
      new Set(['CreateClassInput']),
      true
    )

    const written = JSON.parse(
      await readFile(join(parent, 'schemas', 'CreateClassInput.schema.json'), 'utf-8')
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
  })

  test('leaves an unrelated file in the schemas dir alone', async () => {
    const parent = await makeDir()
    await mkdir(join(parent, 'schemas'), { recursive: true })
    await writeFile(join(parent, 'schemas', 'notes.md'), 'not codegen output', 'utf-8')

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
