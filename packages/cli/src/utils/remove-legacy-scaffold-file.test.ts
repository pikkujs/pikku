import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  pruneLegacyScaffoldFiles,
  refreshScaffoldsImportingRemovedEntryPoints,
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

describe('refreshScaffoldsImportingRemovedEntryPoints', () => {
  const agentConfig = async (contents: string) => {
    const scaffold = await scaffoldDir()
    const file = join(scaffold, 'agent', 'agent.gen.ts')
    await mkdir(join(scaffold, 'agent'), { recursive: true })
    await writeFile(file, contents)
    return { file, config: { publicAgentFile: file } as PikkuCLIConfig }
  }

  test('deletes an agent scaffold left on the pre-#596 entry point', async () => {
    // What a project carries in after upgrading: the scaffold pikku wrote for it
    // under the old CLI, importing a path @pikku/core no longer publishes.
    const { file, config } = await agentConfig(
      `import { canAccessThread } from '@pikku/core/ai-agent'\n`
    )

    await refreshScaffoldsImportingRemovedEntryPoints(config)

    assert.ok(
      !existsSync(file),
      'the scaffold has to go, or `pikku all` finds it present and leaves it'
    )
  })

  test('deletes one left on the removed scorer entry point too', async () => {
    const { file, config } = await agentConfig(
      `import type { AgentRunScore } from '@pikku/core/ai-scorer'\n`
    )

    await refreshScaffoldsImportingRemovedEntryPoints(config)

    assert.ok(!existsSync(file))
  })

  test('deletes an agent scaffold left on the deleted #pikku hub', async () => {
    // The hub is the project's own file, so the scaffold names it by a relative
    // path rather than by package — it is gone all the same.
    const { file, config } = await agentConfig(
      `import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'\n`
    )

    await refreshScaffoldsImportingRemovedEntryPoints(config)

    assert.ok(!existsSync(file))
  })

  test('keeps a scaffold that already imports the renamed entry point', async () => {
    // The project may have edited this file; only an import that cannot compile
    // justifies throwing its changes away.
    const { file, config } = await agentConfig(
      `import { canAccessThread } from '@pikku/core/agent'\n// a local edit\n`
    )

    await refreshScaffoldsImportingRemovedEntryPoints(config)

    assert.ok(existsSync(file))
  })

  test('tolerates a config with no agent scaffold', async () => {
    await refreshScaffoldsImportingRemovedEntryPoints({} as PikkuCLIConfig)
  })
})
