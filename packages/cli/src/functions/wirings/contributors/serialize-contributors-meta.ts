import { relative, sep } from 'node:path'
import type { ContributorsManifestMeta } from '@pikku/inspector'

/**
 * The meta an addon publishes at `.pikku/contributors/pikku-contributors-meta.gen.json`:
 * each contributor's variants as the module (relative to the package root, posix)
 * and export a host imports. The inspector records absolute paths while it reads
 * the addon's own source, so they are made relative here.
 */
export const serializeContributorsMeta = (
  manifest: ContributorsManifestMeta,
  rootDir: string
): string => {
  const contributors: ContributorsManifestMeta = {}
  for (const [name, variants] of Object.entries(manifest)) {
    contributors[name] = {}
    for (const target of ['dev', 'deploy'] as const) {
      const ref = variants[target]
      if (!ref) continue
      contributors[name]![target] = {
        module: relative(rootDir, ref.module).split(sep).join('/'),
        export: ref.export,
      }
    }
  }
  return JSON.stringify({ contributors }, null, 2) + '\n'
}
