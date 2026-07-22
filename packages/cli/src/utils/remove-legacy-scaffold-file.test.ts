import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  pruneLegacyScaffoldFiles,
  removeLegacyScaffoldFile,
} from './remove-legacy-scaffold-file.js'
import type { PikkuCLIConfig } from '../../types/config.js'

const scaffoldDir = async () => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-scaffold-'))
  const scaffold = join(root, 'scaffold')
  await mkdir(scaffold, { recursive: true })
  return scaffold
}

const seed = async (scaffold: string, domain: string, name: string) => {
  const nested = join(scaffold, domain, name)
  await mkdir(join(scaffold, domain), { recursive: true })
  await writeFile(nested, '// nested')
  await writeFile(join(scaffold, name), '// legacy')
  return nested
}

describe('removeLegacyScaffoldFile', () => {
  test('deletes the flat copy one directory above the nested file', async () => {
    const scaffold = await scaffoldDir()
    const nested = await seed(scaffold, 'rpc', 'rpc-public.gen.ts')

    await removeLegacyScaffoldFile(nested)

    assert.ok(existsSync(nested), 'the nested file is the one to keep')
    assert.ok(!existsSync(join(scaffold, 'rpc-public.gen.ts')))
  })

  test('leaves an unrelated file with the same name elsewhere alone', async () => {
    const scaffold = await scaffoldDir()
    const nested = await seed(scaffold, 'rpc', 'rpc-public.gen.ts')
    await mkdir(join(scaffold, 'other'), { recursive: true })
    await writeFile(join(scaffold, 'other', 'rpc-public.gen.ts'), '// other')

    await removeLegacyScaffoldFile(nested)

    assert.ok(existsSync(join(scaffold, 'other', 'rpc-public.gen.ts')))
  })
})

describe('pruneLegacyScaffoldFiles', () => {
  /**
   * The upgrade path: a project generated before the move has both copies on
   * disk. Inspection reads the tree before any scaffold is rewritten, so unless
   * the prune happens up front the run dies on PKU851 and only the *second*
   * codegen succeeds.
   */
  test('clears every scaffold domain in one pass', async () => {
    const scaffold = await scaffoldDir()
    const config = {
      publicRpcFile: await seed(scaffold, 'rpc', 'rpc-public.gen.ts'),
      publicRpcSchemasFile: await seed(
        scaffold,
        'rpc',
        'rpc-public.schemas.gen.ts'
      ),
      authFile: await seed(scaffold, 'auth', 'auth.gen.ts'),
      consoleFunctionsFile: await seed(scaffold, 'console', 'console.gen.ts'),
    } as unknown as PikkuCLIConfig

    await writeFile(join(scaffold, 'auth-secrets.gen.ts'), '// legacy')
    await writeFile(join(scaffold, 'auth-middleware.gen.ts'), '// legacy')

    await pruneLegacyScaffoldFiles(config)

    assert.deepEqual((await readdir(scaffold)).sort(), [
      'auth',
      'console',
      'rpc',
    ])
  })

  test('tolerates a config that has no scaffolds enabled', async () => {
    await pruneLegacyScaffoldFiles({} as PikkuCLIConfig)
  })
})
