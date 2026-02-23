import { readFile, readdir } from 'fs/promises'
import { join } from 'path'

export interface ExternalNode {
  name: string
  displayName: string
  category: string
  type: string
  rpc: string
  description: string
  errorOutput: boolean
  inputSchemaName: string
  outputSchemaName: string
}

export interface ExternalCredential {
  name: string
  displayName: string
  description: string
  secretId: string
  schema: string
}

export interface ExternalPackageMeta {
  package: string
  alias: string
  displayName: string
  description: string
  categories: string[]
  nodes: Record<string, ExternalNode[]>
  credentials: Record<string, ExternalCredential>
}

interface NodesMeta {
  nodes: Record<string, ExternalNode>
  credentials: Record<string, ExternalCredential>
  package: {
    displayName: string
    description: string
    categories: string[]
  }
}

export class ExternalService {
  private externalMetaCache: ExternalPackageMeta[] | null = null
  private iconCache: Map<string, string> = new Map()
  private packagePathMap: Map<string, string> = new Map()

  constructor(private externalPackagesBasePath: string) {}

  private async discoverPackages(): Promise<
    { category: string; packageName: string; packagePath: string }[]
  > {
    const packages: {
      category: string
      packageName: string
      packagePath: string
    }[] = []

    try {
      const categories = await readdir(this.externalPackagesBasePath, {
        withFileTypes: true,
      })

      for (const category of categories) {
        if (!category.isDirectory()) continue

        const categoryPath = join(this.externalPackagesBasePath, category.name)
        const packageDirs = await readdir(categoryPath, {
          withFileTypes: true,
        })

        for (const pkg of packageDirs) {
          if (!pkg.isDirectory()) continue

          const packagePath = join(categoryPath, pkg.name)
          packages.push({
            category: category.name,
            packageName: pkg.name,
            packagePath,
          })
        }
      }
    } catch (error) {
      console.error('Error discovering packages:', error)
    }

    return packages
  }

  async readExternalPackagesMeta(): Promise<ExternalPackageMeta[]> {
    if (this.externalMetaCache) {
      return this.externalMetaCache
    }

    const results: ExternalPackageMeta[] = []
    const discoveredPackages = await this.discoverPackages()

    for (const { packageName, packagePath } of discoveredPackages) {
      try {
        const nodesMetaPath = join(
          packagePath,
          '.pikku',
          'node',
          'pikku-nodes-meta.gen.json'
        )

        const metaContent = await readFile(nodesMetaPath, 'utf-8')
        const meta: NodesMeta = JSON.parse(metaContent)

        const nodesByCategory: Record<string, ExternalNode[]> = {}
        for (const node of Object.values(meta.nodes)) {
          const category = node.category
          if (!nodesByCategory[category]) {
            nodesByCategory[category] = []
          }
          nodesByCategory[category].push(node)
        }

        this.packagePathMap.set(packageName, packagePath)

        results.push({
          package: packageName,
          alias: packageName,
          displayName: meta.package.displayName,
          description: meta.package.description,
          categories: meta.package.categories,
          nodes: nodesByCategory,
          credentials: meta.credentials,
        })
      } catch {
        // Package doesn't have forge metadata, skip it
      }
    }

    this.externalMetaCache = results
    return results
  }

  clearCache(): void {
    this.externalMetaCache = null
    this.packagePathMap.clear()
  }

  async readExternalPackageIcon(alias: string): Promise<string> {
    if (this.iconCache.has(alias)) {
      return this.iconCache.get(alias)!
    }

    const packagePath = this.packagePathMap.get(alias)
    if (!packagePath) {
      this.iconCache.set(alias, '')
      return ''
    }

    try {
      const iconPath = join(packagePath, 'icons', `${alias}.svg`)
      const result = await readFile(iconPath, 'utf-8')
      this.iconCache.set(alias, result)
      return result
    } catch (error) {
      console.error(`Error reading icon for external package ${alias}:`, error)
      this.iconCache.set(alias, '')
      return ''
    }
  }

  async init(): Promise<void> {
    const meta = await this.readExternalPackagesMeta()
    await Promise.all(meta.map((m) => this.readExternalPackageIcon(m.alias)))
  }
}
