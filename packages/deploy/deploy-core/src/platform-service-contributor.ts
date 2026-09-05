import type { EntryGenerationContext } from './provider-adapter.js'

export type BindingSource = 'env' | 'cloudflare'

export interface ContributorPlatform {
  serviceNames: string[]
  needsQueue: boolean
  needsWorkflow: boolean
  needsAgent: boolean
}

export interface PlatformServiceContributor<
  TPlatform extends ContributorPlatform = ContributorPlatform,
> {
  name: string
  requires?: BindingSource[]
  imports?: string[] | ((platform: TPlatform) => string[])
  emit(args: {
    ctx: EntryGenerationContext
    platform: TPlatform
    isGateway: boolean
  }): string[]
}

export const DEFAULT_BINDING_SOURCES: readonly BindingSource[] = ['env']

export const contributorBindingSources = (
  contributor: PlatformServiceContributor<any>
): readonly BindingSource[] => contributor.requires ?? DEFAULT_BINDING_SOURCES

export const dedupeContributors = <T extends PlatformServiceContributor<any>>(
  contributors: readonly T[] | undefined
): T[] => {
  const byName = new Map<string, T>()
  for (const contributor of contributors ?? []) {
    byName.set(contributor.name, contributor)
  }
  return [...byName.values()]
}

export const partitionContributors = <
  T extends PlatformServiceContributor<any>,
>(
  contributors: readonly T[],
  supported: readonly BindingSource[]
): { supported: T[]; unsupported: T[] } => {
  const ok: T[] = []
  const rejected: T[] = []
  for (const contributor of contributors) {
    const sources = contributorBindingSources(contributor)
    if (sources.every((source) => supported.includes(source))) {
      ok.push(contributor)
    } else {
      rejected.push(contributor)
    }
  }
  return { supported: ok, unsupported: rejected }
}

export const assertContributorsSupported = (
  contributors: readonly PlatformServiceContributor<any>[],
  supported: readonly BindingSource[],
  adapterName: string
): void => {
  const { unsupported } = partitionContributors(contributors, supported)
  if (unsupported.length === 0) return
  const detail = unsupported
    .map(
      (contributor) =>
        `${contributor.name} (requires ${contributorBindingSources(contributor).join(', ')})`
    )
    .join('; ')
  throw new Error(
    `${adapterName} adapter only provides ${supported.join(', ')} bindings; unsupported contributors: ${detail}`
  )
}

export const collectContributorImports = <
  TPlatform extends ContributorPlatform,
>(
  contributors: readonly PlatformServiceContributor<TPlatform>[],
  platform: TPlatform
): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const contributor of contributors) {
    const lines =
      typeof contributor.imports === 'function'
        ? contributor.imports(platform)
        : (contributor.imports ?? [])
    for (const line of lines) {
      if (!seen.has(line)) {
        seen.add(line)
        out.push(line)
      }
    }
  }
  return out
}

export const collectContributorLines = <TPlatform extends ContributorPlatform>(
  contributors: readonly PlatformServiceContributor<TPlatform>[],
  args: { ctx: EntryGenerationContext; platform: TPlatform; isGateway: boolean }
): string[] => {
  const out: string[] = []
  for (const contributor of contributors) {
    const lines = contributor.emit(args)
    if (lines.length > 0) out.push(...lines)
  }
  return out
}
