import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  pruneLegacyScaffoldFiles,
  refreshScaffoldsImportingRemovedEntryPoints,
  removeDisabledOriginScaffolds,
  removeLegacyScaffoldFile,
  removeRetiredScaffoldFiles,
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

describe('removeRetiredScaffoldFiles', () => {
  const adminScaffold = async () => {
    const scaffold = await scaffoldDir()
    await mkdir(join(scaffold, 'admin'), { recursive: true })
    const functions = join(scaffold, 'admin', 'user-admin.gen.ts')
    const schemas = join(scaffold, 'admin', 'user-admin.schemas.gen.ts')
    await writeFile(functions, 'export const pikkuAdminListUsers = null\n')
    await writeFile(schemas, '// schemas\n')
    return { scaffold, functions, schemas }
  }

  test('deletes the retired user-admin scaffold', async () => {
    // Not tidying: a leftover registers pikkuAdminListUsers and its siblings.
    const { scaffold, functions, schemas } = await adminScaffold()

    await removeRetiredScaffoldFiles({
      resolvedScaffoldDir: scaffold,
    } as PikkuCLIConfig)

    assert.ok(!existsSync(functions))
    assert.ok(!existsSync(schemas))
  })

  test('leaves the rest of the scaffold directory alone', async () => {
    const { scaffold } = await adminScaffold()
    await seed(scaffold, 'console', 'console.gen.ts')

    await removeRetiredScaffoldFiles({
      resolvedScaffoldDir: scaffold,
    } as PikkuCLIConfig)

    assert.ok(existsSync(join(scaffold, 'console', 'console.gen.ts')))
  })

  test('tolerates a config that never went through scaffold resolution', async () => {
    await removeRetiredScaffoldFiles({} as PikkuCLIConfig)
  })
})

describe('removeDisabledOriginScaffolds', () => {
  const GENERATED = '// AUTO-GENERATED by pikku CLI — do not edit\n'

  const files = async () => {
    const scaffold = await scaffoldDir()
    await mkdir(join(scaffold, 'cors'), { recursive: true })
    await mkdir(join(scaffold, 'analytics'), { recursive: true })
    const paths = {
      analyticsOriginFile: join(
        scaffold,
        'analytics',
        'analytics-origin.gen.ts'
      ),
      corsFile: join(scaffold, 'cors', 'cors.gen.ts'),
      corsOriginsFile: join(scaffold, 'cors', 'cors-origins.gen.ts'),
    }
    for (const file of Object.values(paths)) await writeFile(file, GENERATED)
    return paths
  }

  test('originLock: false removes the lock and keeps what cors still needs', async () => {
    const paths = await files()
    await removeDisabledOriginScaffolds({
      ...paths,
      scaffold: { analytics: { originLock: false }, cors: true },
    } as unknown as PikkuCLIConfig)
    assert.ok(!existsSync(paths.analyticsOriginFile))
    assert.ok(existsSync(paths.corsFile))
    assert.ok(existsSync(paths.corsOriginsFile))
  })

  test('the origins helper stays while only the lock needs it', async () => {
    const paths = await files()
    await removeDisabledOriginScaffolds({
      ...paths,
      scaffold: { analytics: true },
    } as unknown as PikkuCLIConfig)
    assert.ok(!existsSync(paths.corsFile))
    assert.ok(existsSync(paths.corsOriginsFile))
    assert.ok(existsSync(paths.analyticsOriginFile))
  })

  test('nothing enabled removes all three', async () => {
    const paths = await files()
    await removeDisabledOriginScaffolds({
      ...paths,
      scaffold: {},
    } as unknown as PikkuCLIConfig)
    for (const file of Object.values(paths)) assert.ok(!existsSync(file))
  })

  test('a file the project wrote itself is never removed', async () => {
    const paths = await files()
    await writeFile(paths.corsFile, 'export const mine = 1\n')
    await removeDisabledOriginScaffolds({
      ...paths,
      scaffold: {},
    } as unknown as PikkuCLIConfig)
    assert.ok(existsSync(paths.corsFile))
  })
})
