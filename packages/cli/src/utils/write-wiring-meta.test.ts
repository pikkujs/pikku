import { strict as assert } from 'assert'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, test } from 'node:test'
import { writeMetaSidecar, writeWiringMeta } from './write-wiring-meta.js'
import type { CLILogger } from '../services/cli-logger.service.js'

const noopLogger = {
  info: () => {},
  error: () => {},
  debug: () => {},
  warn: () => {},
} as unknown as CLILogger

const dirs: string[] = []

const makeDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pikku-wiring-meta-'))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

const meta = {
  myThing: {
    pikkuFuncId: 'myThing',
    description: 'the long story',
  },
}

const readJson = async (path: string) =>
  JSON.parse(await readFile(path, 'utf-8'))

describe('writeMetaSidecar', () => {
  test('writes the minimal sidecar with the verbose fields stripped', async () => {
    const dir = await makeDir()
    const metaJsonFile = join(dir, 'pikku-thing-meta.gen.json')

    await writeMetaSidecar({ logger: noopLogger, meta, metaJsonFile })

    assert.deepEqual(await readJson(metaJsonFile), {
      myThing: { pikkuFuncId: 'myThing' },
    })
  })

  test('writes the verbose sibling beside it', async () => {
    const dir = await makeDir()
    const metaJsonFile = join(dir, 'pikku-thing-meta.gen.json')

    await writeMetaSidecar({ logger: noopLogger, meta, metaJsonFile })

    assert.deepEqual(
      await readJson(join(dir, 'pikku-thing-meta-verbose.gen.json')),
      meta
    )
  })

  test('omits the verbose sibling when there is nothing extra to say', async () => {
    const dir = await makeDir()
    const metaJsonFile = join(dir, 'pikku-thing-meta.gen.json')

    await writeMetaSidecar({
      logger: noopLogger,
      meta: { myThing: { pikkuFuncId: 'myThing' } },
      metaJsonFile,
    })

    assert.equal(
      existsSync(join(dir, 'pikku-thing-meta-verbose.gen.json')),
      false
    )
  })

  test('writes a caller-supplied minimal meta rather than deriving one', async () => {
    const dir = await makeDir()
    const metaJsonFile = join(dir, 'pikku-thing-meta.gen.json')

    await writeMetaSidecar({
      logger: noopLogger,
      meta,
      minimalMeta: { myThing: { pikkuFuncId: 'myThing', services: ['db'] } },
      metaJsonFile,
    })

    assert.deepEqual(await readJson(metaJsonFile), {
      myThing: { pikkuFuncId: 'myThing', services: ['db'] },
    })
  })

  test('names the verbose sibling from the extension when the path is not a .gen.json', async () => {
    const dir = await makeDir()
    const metaJsonFile = join(dir, 'nodes.json')

    await writeMetaSidecar({ logger: noopLogger, meta, metaJsonFile })

    assert.deepEqual(await readJson(join(dir, 'nodes-verbose.json')), meta)
  })

  test('warns rather than guessing when no verbose path can be derived', async () => {
    const dir = await makeDir()
    const metaJsonFile = join(dir, 'nodes')
    const warnings: unknown[] = []
    const logger = {
      ...noopLogger,
      warn: (message: unknown) => warnings.push(message),
    } as unknown as CLILogger

    await writeMetaSidecar({
      logger,
      meta,
      metaJsonFile,
      ignoreModifyComment: true,
    })

    assert.equal(warnings.length, 1)
    assert.deepEqual(await readJson(metaJsonFile), {
      myThing: { pikkuFuncId: 'myThing' },
    })
  })
})

describe('writeWiringMeta', () => {
  const serializeMetaTS = ({ importStatement }: { importStatement: string }) =>
    `${importStatement}\nexport default metaData`

  test('writes a meta module importing the sidecar by relative path', async () => {
    const dir = await makeDir()

    await writeWiringMeta({
      logger: noopLogger,
      meta,
      metaJsonFile: join(dir, 'meta', 'pikku-thing-meta.gen.json'),
      metaFile: join(dir, 'pikku-thing-meta.gen.ts'),
      packageMappings: {},
      supportsImportAttributes: false,
      serializeMetaTS,
    })

    const output = await readFile(join(dir, 'pikku-thing-meta.gen.ts'), 'utf-8')

    assert.match(
      output,
      /import metaData from '\.\/meta\/pikku-thing-meta\.gen\.json'/
    )
  })

  test('declares the json import attribute only when the runtime supports it', async () => {
    const dir = await makeDir()
    const write = async (supportsImportAttributes: boolean) => {
      const metaFile = join(dir, `${supportsImportAttributes}.gen.ts`)
      await writeWiringMeta({
        logger: noopLogger,
        meta,
        metaJsonFile: join(dir, 'pikku-thing-meta.gen.json'),
        metaFile,
        packageMappings: {},
        supportsImportAttributes,
        serializeMetaTS,
      })
      return readFile(metaFile, 'utf-8')
    }

    assert.match(await write(true), /with \{ type: 'json' \}/)
    assert.doesNotMatch(await write(false), /with \{ type: 'json' \}/)
  })

  test('writes the sidecar pair alongside the module', async () => {
    const dir = await makeDir()

    await writeWiringMeta({
      logger: noopLogger,
      meta,
      metaJsonFile: join(dir, 'pikku-thing-meta.gen.json'),
      metaFile: join(dir, 'pikku-thing-meta.gen.ts'),
      packageMappings: {},
      supportsImportAttributes: false,
      serializeMetaTS,
    })

    assert.deepEqual(await readJson(join(dir, 'pikku-thing-meta.gen.json')), {
      myThing: { pikkuFuncId: 'myThing' },
    })
    assert.deepEqual(
      await readJson(join(dir, 'pikku-thing-meta-verbose.gen.json')),
      meta
    )
  })

  test('hands the serializer the import path so a wiring can build its own module', async () => {
    const dir = await makeDir()
    const seen: string[] = []

    await writeWiringMeta({
      logger: noopLogger,
      meta,
      metaJsonFile: join(dir, 'pikku-thing-meta.gen.json'),
      metaFile: join(dir, 'pikku-thing-meta.gen.ts'),
      packageMappings: {},
      supportsImportAttributes: true,
      serializeMetaTS: ({ jsonImportPath }) => {
        seen.push(jsonImportPath)
        return 'export default {}'
      },
    })

    assert.deepEqual(seen, ['./pikku-thing-meta.gen.json'])
  })
})
