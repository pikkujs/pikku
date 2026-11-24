import { readFileSync } from 'fs'
import type { InspectorState } from '@pikku/inspector'
import { addonResolutionDirs, createAddonResolver } from '@pikku/inspector'

/**
 * The services each installed addon declares, by package, read from the
 * `services` meta the addon's own `pikku all` wrote. This reads the same
 * file the inspector validates `wireAddon({ services })` against, so the
 * type and the build-time check cannot disagree. A package whose meta is not
 * installed or unreadable is left out, which types its names as plain strings
 * and leaves the inspector's check (PKU374) as the only guard.
 */
export const addonServiceNames = (
  state: Pick<InspectorState, 'rootDir' | 'rpc'>
): Record<string, string[]> => {
  const names: Record<string, string[]> = {}
  for (const [, decl] of state.rpc.wireAddonDeclarations) {
    const pkg = decl.remote ? decl.local?.package : decl.package
    if (!pkg || pkg in names) {
      continue
    }
    try {
      const metaPath = createAddonResolver(
        addonResolutionDirs(state.rootDir, decl.file)
      ).resolve(`${pkg}/.pikku/services/pikku-services-meta.gen.json`)
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
      if (meta?.services && typeof meta.services === 'object') {
        names[pkg] = Object.keys(meta.services)
      }
    } catch {
      continue
    }
  }
  return names
}
