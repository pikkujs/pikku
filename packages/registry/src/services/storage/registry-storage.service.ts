import type {
  PackageRegistryEntry,
  ListOptions,
  ListResult,
} from '../../types.js'

export interface RegistryStorage {
  savePackage(entry: PackageRegistryEntry): Promise<void>
  getPackage(id: string): Promise<PackageRegistryEntry | null>
  listPackages(opts?: ListOptions): Promise<ListResult>
  searchPackages(query: string): Promise<PackageRegistryEntry[]>
  deletePackage(id: string): Promise<void>
}
