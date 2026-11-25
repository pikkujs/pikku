import { relative, sep } from 'node:path'
import {
  PROVIDER_PROFILES,
  type ProviderCollectionMeta,
  type ProviderMeta,
  type ProviderVariantName,
  type ProvidersManifest,
} from '@pikku/inspector'

const VARIANT_ORDER: readonly ProviderVariantName[] = [
  'dev',
  'deploy',
  ...PROVIDER_PROFILES.map((p) => `deploy:${p}` as const),
  'common',
]

const relativeToPackage = (rootDir: string, file: string): string =>
  relative(rootDir, file).split(sep).join('/')

/**
 * The meta an addon publishes at `.pikku/providers/pikku-providers-meta.gen.json`:
 * each provider's module (relative to the package root, posix), export, and what
 * each variant needs and provides, which is what a host opts in by name and
 * resolves against. The inspector records absolute paths while it reads the
 * addon's own source, so they are made relative here.
 */
export const serializeProvidersMeta = (
  providers: Record<string, ProviderMeta>,
  rootDir: string,
  collections: Record<string, ProviderCollectionMeta> = {}
): string => {
  const published: ProvidersManifest['providers'] = {}
  for (const [name, meta] of Object.entries(providers)) {
    const variants: ProviderMeta['variants'] = {}
    for (const variant of VARIANT_ORDER) {
      const read = meta.variants[variant]
      if (!read) continue
      variants[variant] = {
        needs: read.needs,
        optional: read.optional ?? [],
        provides: read.provides,
        optionalProvides: read.optionalProvides ?? [],
        ...(read.module && read.export
          ? {
              module: relativeToPackage(rootDir, read.module),
              export: read.export,
            }
          : {}),
      }
    }
    published[name] = {
      kind: meta.kind ?? 'singleton',
      module: relativeToPackage(rootDir, meta.module),
      export: meta.export,
      variants,
      ...(meta.addTo ? { addTo: meta.addTo } : {}),
      ...(meta.replaces?.length ? { replaces: meta.replaces } : {}),
      ...(meta.onServerStart ? { onServerStart: true } : {}),
    }
  }
  const publishedCollections: ProvidersManifest['collections'] = {}
  for (const [name, collection] of Object.entries(collections)) {
    publishedCollections[name] = {
      name: collection.name,
      module: relativeToPackage(rootDir, collection.module),
      export: collection.export,
    }
  }
  const manifest: ProvidersManifest = {
    metaVersion: 2,
    providers: published,
    collections: publishedCollections,
  }
  return JSON.stringify(manifest, null, 2) + '\n'
}
