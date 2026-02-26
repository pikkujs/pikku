export interface FunctionMeta {
  pikkuFuncId: string
  functionType: string
  funcWrapper: string
  sessionless: boolean
  name: string
  inputSchemaName: string | null
  outputSchemaName: string | null
  inputs: string[]
  outputs: string[]
  expose: boolean
  contractHash: string
}

export interface PackageRegistryEntry {
  id: string
  name: string
  displayName: string
  description: string
  version: string
  author: string
  repository?: string
  license?: string
  readme?: string
  icon?: string
  publishedAt: string
  updatedAt: string
  tags: string[]
  categories: string[]
  functions: Record<string, FunctionMeta>
  rpcWirings: Record<string, string>
  agents: Record<string, unknown>
  secrets: Record<string, unknown>
  variables: Record<string, unknown>
  schemas: Record<string, unknown>
}

export type ExternalPackageMeta = PackageRegistryEntry
export type ExternalPackageDetail = PackageRegistryEntry

export class ExternalService {
  constructor(private registryUrl: string) {}

  async readExternalPackagesMeta(): Promise<ExternalPackageMeta[]> {
    const response = await fetch(`${this.registryUrl}/api/packages`)
    const result = await response.json()
    return result.packages ?? []
  }

  async readExternalPackage(id: string): Promise<ExternalPackageDetail | null> {
    const response = await fetch(
      `${this.registryUrl}/api/packages/${encodeURIComponent(id)}`
    )
    return response.json()
  }

  async init(): Promise<void> {}
}
