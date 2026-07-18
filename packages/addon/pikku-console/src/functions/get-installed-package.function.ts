import { pikkuFunc } from '#pikku'
import { pikkuState } from '@pikku/core/internal'

import type { AddonPackageInfo } from '../services/addon.service.js'

export const getAddonInstalledPackage = pikkuFunc<
  { packageName: string },
  AddonPackageInfo | null
>({
  title: 'Get Installed Addon Package',
  description:
    'Returns the full details of a locally installed addon by reading from pikkuState and .pikku files',
  expose: true,
  func: async ({ metaService }, { packageName }) => {
    const factories = pikkuState(packageName, 'package', 'factories')
    if (!factories) return null

    const functions = pikkuState(packageName, 'function', 'meta') ?? {}
    const agentsMeta = pikkuState(packageName, 'agent', 'agentsMeta')
    const agents = agentsMeta ? { ...agentsMeta } : {}

    // Read from the ADDON PACKAGE's own `.pikku` (resolved from node_modules),
    // not the app's — otherwise every addon returns the app-wide secrets/wirings
    // and the requirements view can't show what THIS addon actually needs.
    const readPkgFile = (rel: string) =>
      metaService.readPackageFile?.(packageName, rel) ?? Promise.resolve(null)
    const readJson = async <T>(path: string): Promise<T | null> => {
      const content = await readPkgFile(path)
      return content ? (JSON.parse(content) as T) : null
    }

    const secrets =
      (await readJson<Record<string, unknown>>(
        'secrets/pikku-secrets-meta.gen.json'
      )) ?? {}

    const credentials =
      (await readJson<Record<string, unknown>>(
        'credentials/pikku-credentials-meta.gen.json'
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

    // Read all schemas from the addon's schemas directory
    const schemas: Record<string, unknown> = {}
    const schemaFiles =
      (await metaService.readPackageDir?.(packageName, 'schemas/schemas')) ?? []
    for (const file of schemaFiles) {
      if (file.endsWith('.schema.json')) {
        const name = file.replace('.schema.json', '')
        const content = await readPkgFile(`schemas/schemas/${file}`)
        if (content) {
          schemas[name] = JSON.parse(content)
        }
      }
    }

    const nodesMeta = await readJson<{
      package?: { icon?: string; displayName?: string; description?: string }
    }>('console/pikku-addon-meta.gen.json')

    // README and package.json are in the package root (one level up from .pikku)
    const readme = await readPkgFile('../README.md')
    const pkgJsonContent = await readPkgFile('../package.json')
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
      credentials,
      variables,
      httpRoutes,
      channels,
      cli,
      mcp,
      schemas,
    } as unknown as AddonPackageInfo
  },
})
