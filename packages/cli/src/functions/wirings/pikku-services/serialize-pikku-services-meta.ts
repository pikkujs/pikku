import { relative, sep } from 'node:path'
import type {
  PikkuServiceMeta,
  PikkuServicesManifestMeta,
} from '@pikku/inspector'

const relativeToPackage = (rootDir: string, file: string): string =>
  relative(rootDir, file).split(sep).join('/')

/**
 * The meta an addon publishes at `.pikku/services/pikku-services-meta.gen.json`:
 * each service's module (relative to the package root, posix), export, and what
 * each variant needs and provides, which is what a host opts in by name and
 * resolves against. The inspector records absolute paths while it reads the
 * addon's own source, so they are made relative here.
 */
export const serializePikkuServicesMeta = (
  manifest: PikkuServicesManifestMeta,
  rootDir: string
): string => {
  const services: PikkuServicesManifestMeta = {}
  for (const [name, meta] of Object.entries(manifest)) {
    const variants: PikkuServiceMeta['variants'] = {}
    for (const variant of ['dev', 'deploy', 'common'] as const) {
      const read = meta.variants[variant]
      if (!read) continue
      variants[variant] = {
        needs: read.needs,
        provides: read.provides,
        ...(read.module && read.export
          ? {
              module: relativeToPackage(rootDir, read.module),
              export: read.export,
            }
          : {}),
      }
    }
    services[name] = {
      module: relativeToPackage(rootDir, meta.module),
      export: meta.export,
      variants,
      ...(meta.onServerStart ? { onServerStart: true } : {}),
    }
  }
  return JSON.stringify({ services }, null, 2) + '\n'
}
