import type { RegistryStorage } from './storage/registry-storage.service.js'
import type { IngestionService } from './ingestion.service.js'
import type { PackageRegistryEntry, ListOptions, ListResult } from '../types.js'

export class RegistryService {
  constructor(
    private storage: RegistryStorage,
    private ingestionService: IngestionService
  ) {}

  async ingest(
    packageName: string,
    version?: string
  ): Promise<PackageRegistryEntry> {
    const existing = await this.storage.getPackage(this.deriveId(packageName))
    const entry = await this.ingestionService.ingest(packageName, version)

    if (existing) {
      entry.publishedAt = existing.publishedAt
    }

    await this.storage.savePackage(entry)
    return entry
  }

  async ingestLocal(packageDir: string): Promise<PackageRegistryEntry> {
    const entry = await this.ingestionService.ingestLocal(packageDir)
    const existing = await this.storage.getPackage(entry.id)

    if (existing) {
      entry.publishedAt = existing.publishedAt
    }

    await this.storage.savePackage(entry)
    return entry
  }

  async getPackage(id: string): Promise<PackageRegistryEntry | null> {
    return this.storage.getPackage(id)
  }

  async listPackages(opts?: ListOptions): Promise<ListResult> {
    return this.storage.listPackages(opts)
  }

  async searchPackages(query: string): Promise<PackageRegistryEntry[]> {
    return this.storage.searchPackages(query)
  }

  async getPackageIcon(id: string): Promise<string | null> {
    const pkg = await this.storage.getPackage(id)
    return pkg?.icon ?? null
  }

  private deriveId(packageName: string): string {
    return packageName.replace(/^@/, '').replace(/\//g, '-').toLowerCase()
  }
}
