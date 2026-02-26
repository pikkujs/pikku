import { readFile, writeFile, unlink, mkdir } from 'fs/promises'
import { join } from 'path'
import type { RegistryStorage } from './registry-storage.service.js'
import type {
  PackageRegistryEntry,
  ListOptions,
  ListResult,
} from '../../types.js'

interface PackageIndex {
  packages: PackageIndexEntry[]
}

interface PackageIndexEntry {
  id: string
  name: string
  displayName: string
  description: string
  version: string
  tags: string[]
  categories: string[]
  updatedAt: string
}

export class JsonFileStorage implements RegistryStorage {
  private indexPath: string

  constructor(private dataDir: string) {
    this.indexPath = join(dataDir, 'index.json')
  }

  async init(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true })
    try {
      await readFile(this.indexPath, 'utf-8')
    } catch {
      await writeFile(this.indexPath, JSON.stringify({ packages: [] }, null, 2))
    }
  }

  async savePackage(entry: PackageRegistryEntry): Promise<void> {
    const packagePath = join(this.dataDir, `${entry.id}.json`)
    await writeFile(packagePath, JSON.stringify(entry, null, 2))
    await this.updateIndex(entry)
  }

  async getPackage(id: string): Promise<PackageRegistryEntry | null> {
    const packagePath = join(this.dataDir, `${id}.json`)
    try {
      const content = await readFile(packagePath, 'utf-8')
      return JSON.parse(content)
    } catch {
      return null
    }
  }

  async listPackages(opts?: ListOptions): Promise<ListResult> {
    const index = await this.readIndex()
    let filtered = index.packages

    if (opts?.category) {
      filtered = filtered.filter((p) => p.categories.includes(opts.category!))
    }
    if (opts?.tag) {
      filtered = filtered.filter((p) => p.tags.includes(opts.tag!))
    }

    const total = filtered.length
    const offset = opts?.offset ?? 0
    const limit = opts?.limit ?? 50
    const packages: PackageRegistryEntry[] = []

    const page = filtered.slice(offset, offset + limit)
    for (const entry of page) {
      const pkg = await this.getPackage(entry.id)
      if (pkg) {
        packages.push(pkg)
      }
    }

    return { packages, total }
  }

  async searchPackages(query: string): Promise<PackageRegistryEntry[]> {
    const lower = query.toLowerCase()
    const index = await this.readIndex()

    const matches = index.packages.filter(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        p.displayName.toLowerCase().includes(lower) ||
        p.description.toLowerCase().includes(lower) ||
        p.tags.some((t) => t.toLowerCase().includes(lower))
    )

    const results: PackageRegistryEntry[] = []
    for (const entry of matches.slice(0, 50)) {
      const pkg = await this.getPackage(entry.id)
      if (pkg) {
        results.push(pkg)
      }
    }
    return results
  }

  async deletePackage(id: string): Promise<void> {
    const packagePath = join(this.dataDir, `${id}.json`)
    try {
      await unlink(packagePath)
    } catch {
      // Already deleted
    }
    await this.removeFromIndex(id)
  }

  private async readIndex(): Promise<PackageIndex> {
    try {
      const content = await readFile(this.indexPath, 'utf-8')
      return JSON.parse(content)
    } catch {
      return { packages: [] }
    }
  }

  private async updateIndex(entry: PackageRegistryEntry): Promise<void> {
    const index = await this.readIndex()
    const existing = index.packages.findIndex((p) => p.id === entry.id)

    const indexEntry: PackageIndexEntry = {
      id: entry.id,
      name: entry.name,
      displayName: entry.displayName,
      description: entry.description,
      version: entry.version,
      tags: entry.tags,
      categories: entry.categories,
      updatedAt: entry.updatedAt,
    }

    if (existing >= 0) {
      index.packages[existing] = indexEntry
    } else {
      index.packages.push(indexEntry)
    }

    await writeFile(this.indexPath, JSON.stringify(index, null, 2))
  }

  private async removeFromIndex(id: string): Promise<void> {
    const index = await this.readIndex()
    index.packages = index.packages.filter((p) => p.id !== id)
    await writeFile(this.indexPath, JSON.stringify(index, null, 2))
  }
}
