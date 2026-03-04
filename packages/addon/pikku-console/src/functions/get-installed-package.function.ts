import { pikkuSessionlessFunc } from '#pikku'
import { pikkuState } from '@pikku/core/internal'
import { readFile } from 'fs/promises'
import { join } from 'path'

import type { AddonPackageInfo } from '../services/addon.service.js'

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const content = await readFile(path, 'utf-8')
    return JSON.parse(content) as T
  } catch {
    return null
  }
}

export const getAddonInstalledPackage = pikkuSessionlessFunc<
  { packageName: string },
  AddonPackageInfo | null
>({
  title: 'Get Installed Addon Package',
  description:
    'Returns the full details of a locally installed addon by reading from pikkuState and .pikku files',
  expose: true,
  auth: false,
  func: async (_services, { packageName }) => {
    const metaDir = pikkuState(packageName, 'package', 'metaDir')
    if (!metaDir) return null

    const functions = pikkuState(packageName, 'function', 'meta') ?? {}
    const agentsMeta = pikkuState(packageName, 'agent', 'agentsMeta')
    const agents = agentsMeta ? { ...agentsMeta } : {}

    const secrets =
      (await readJsonFile<Record<string, unknown>>(
        join(metaDir, 'secrets', 'pikku-secrets-meta.gen.json')
      )) ?? {}

    const variables =
      (await readJsonFile<Record<string, unknown>>(
        join(metaDir, 'variables', 'pikku-variables-meta.gen.json')
      )) ?? {}

    const httpRoutes =
      (await readJsonFile(
        join(metaDir, 'http', 'pikku-http-wirings-meta.gen.json')
      )) ?? {}

    const channels =
      (await readJsonFile(
        join(metaDir, 'channel', 'pikku-channels-meta.gen.json')
      )) ?? {}

    const cliData = await readJsonFile<{ programs: Record<string, unknown> }>(
      join(metaDir, 'cli', 'pikku-cli-wirings-meta.gen.json')
    )
    const cli = cliData?.programs ?? {}

    const mcp = await readJsonFile(
      join(metaDir, 'mcp', 'pikku-mcp-wirings-meta.gen.json')
    )

    const schemas = await readAllSchemas(join(metaDir, 'schemas', 'schemas'))

    const nodesMeta = await readJsonFile<{
      package?: { icon?: string; displayName?: string; description?: string }
    }>(join(metaDir, 'console', 'pikku-addon-meta.gen.json'))

    let readme: string | undefined
    try {
      const pkgDir = join(metaDir, '..')
      readme = await readFile(join(pkgDir, 'README.md'), 'utf-8')
    } catch {
      // no readme
    }

    let pkgJson: {
      version?: string
      author?: string | { name: string }
      repository?: string | { url: string }
      license?: string
      keywords?: string[]
    } = {}
    try {
      const pkgDir = join(metaDir, '..')
      pkgJson = JSON.parse(
        await readFile(join(pkgDir, 'package.json'), 'utf-8')
      )
    } catch {
      // no package.json
    }

    const id = packageName.replace(/^@/, '').replace(/\//g, '-').toLowerCase()
    const author =
      typeof pkgJson.author === 'string'
        ? pkgJson.author
        : (pkgJson.author?.name ?? '')
    const repository =
      typeof pkgJson.repository === 'string'
        ? pkgJson.repository
        : pkgJson.repository?.url

    return {
      id,
      name: packageName,
      displayName: nodesMeta?.package?.displayName ?? packageName,
      description: nodesMeta?.package?.description ?? '',
      version: pkgJson.version ?? '0.0.0',
      author,
      repository,
      license: pkgJson.license,
      readme,
      icon: nodesMeta?.package?.icon,
      publishedAt: '',
      updatedAt: '',
      tags: pkgJson.keywords ?? [],
      categories: [],
      functions,
      agents,
      secrets,
      variables,
      httpRoutes,
      channels,
      cli,
      mcp,
      schemas,
    } as AddonPackageInfo
  },
})

async function readAllSchemas(
  schemasDir: string
): Promise<Record<string, unknown>> {
  const schemas: Record<string, unknown> = {}
  try {
    const { readdir } = await import('fs/promises')
    const files = await readdir(schemasDir)
    for (const file of files) {
      if (file.endsWith('.schema.json')) {
        const name = file.replace('.schema.json', '')
        const content = await readFile(join(schemasDir, file), 'utf-8')
        schemas[name] = JSON.parse(content)
      }
    }
  } catch {
    // no schemas
  }
  return schemas
}
