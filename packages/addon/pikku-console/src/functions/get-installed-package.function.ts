import { pikkuSessionlessFunc } from '#pikku'
import { pikkuState } from '@pikku/core/internal'

import type { AddonPackageInfo } from '../services/addon.service.js'

export const getAddonInstalledPackage = pikkuSessionlessFunc<
  { packageName: string },
  AddonPackageInfo | null
>({
  title: 'Get Installed Addon Package',
  description:
    'Returns the full details of a locally installed addon by reading from pikkuState and .pikku files',
  expose: true,
  auth: false,
  func: async ({ metaService }, { packageName }) => {
    const factories = pikkuState(packageName, 'package', 'factories')
    if (!factories) return null

    const functions = pikkuState(packageName, 'function', 'meta') ?? {}
    const agentsMeta = pikkuState(packageName, 'agent', 'agentsMeta')
    const agents = agentsMeta ? { ...agentsMeta } : {}

    const readJson = async <T>(path: string): Promise<T | null> => {
      const content = await metaService.readFile(path)
      return content ? (JSON.parse(content) as T) : null
    }

    const secrets =
      (await readJson<Record<string, unknown>>(
        'secrets/pikku-secrets-meta.gen.json'
      )) ?? {}

    const variables =
      (await readJson<Record<string, unknown>>(
        'variables/pikku-variables-meta.gen.json'
      )) ?? {}

    const httpRoutes =
      (await readJson('http/pikku-http-wirings-meta.gen.json')) ?? {}

    const channels =
      (await readJson('channel/pikku-channels-meta.gen.json')) ?? {}

    const cliData = await readJson<{ programs: Record<string, unknown> }>(
      'cli/pikku-cli-wirings-meta.gen.json'
    )
    const cli = cliData?.programs ?? {}

    const mcp = await readJson('mcp/pikku-mcp-wirings-meta.gen.json')

    // Read all schemas from the schemas directory
    const schemas: Record<string, unknown> = {}
    let schemaFiles: string[] = []
    try {
      schemaFiles = (await metaService.readDir('schemas/schemas')) || []
    } catch {
      // fallback to empty array
    }
    for (const file of schemaFiles) {
      if (file.endsWith('.schema.json')) {
        const name = file.replace('.schema.json', '')
        const content = await metaService.readFile(`schemas/schemas/${file}`)
        if (content) {
          schemas[name] = JSON.parse(content)
        }
      }
    }

    const nodesMeta = await readJson<{
      package?: { icon?: string; displayName?: string; description?: string }
    }>('console/pikku-addon-meta.gen.json')

    // README and package.json are in the parent directory (one level up from .pikku)
    const readme = await metaService.readFile('../README.md')
    const pkgJsonContent = await metaService.readFile('../package.json')
    let pkgJson: {
      version?: string
      author?: string | { name: string }
      repository?: string | { url: string }
      license?: string
      keywords?: string[]
    } = {}
    if (pkgJsonContent) {
      try {
        pkgJson = JSON.parse(pkgJsonContent)
      } catch {
        // fallback to empty object
      }
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
      readme: readme ?? undefined,
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
    } as unknown as AddonPackageInfo
  },
})
