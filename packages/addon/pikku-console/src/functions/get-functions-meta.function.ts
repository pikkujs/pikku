import { pikkuSessionlessFunc } from '#pikku'
import type { FunctionMeta } from '../services/wiring.service.js'

export interface FunctionVersionEntry {
  version: number
  inputHash: string
  outputHash: string
}

export type FunctionMetaWithVersions = FunctionMeta & {
  version?: number
  versions?: FunctionVersionEntry[]
}

export const getFunctionsMeta = pikkuSessionlessFunc<
  null,
  FunctionMetaWithVersions[]
>({
  title: 'Get Functions Metadata',
  description:
    'Reads function metadata from metaService and returns it as a flat array of FunctionMeta objects, enriched with version history from the versions manifest if available.',
  expose: true,
  auth: false,
  func: async ({ metaService }) => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const functionsMeta = await metaService.getFunctionsMeta()
    const functions = Object.values(functionsMeta) as FunctionMetaWithVersions[]

    let contracts: Record<
      string,
      {
        latest: number
        versions: Record<string, { inputHash: string; outputHash: string }>
      }
    > | null = null
    try {
      const manifestPath = join(
        metaService.basePath!,
        '..',
        'versions.pikku.json'
      )
      const content = await readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(content)
      contracts = manifest.contracts || null
    } catch {
      // versions not enabled
    }

    if (contracts) {
      for (const func of functions) {
        const funcId = (func as any).pikkuFuncId || (func as any).pikkuFuncName
        const contract = contracts[funcId]
        if (contract) {
          func.version = contract.latest
          func.versions = Object.entries(contract.versions)
            .map(([v, hashes]) => ({
              version: Number(v),
              inputHash: hashes.inputHash,
              outputHash: hashes.outputHash,
            }))
            .sort((a, b) => b.version - a.version)
        }
      }
    }

    return functions
  },
})
