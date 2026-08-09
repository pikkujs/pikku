import { pikkuState } from '../../pikku-state.js'
import type { WorkflowRuntimeMeta } from './workflow.types.js'

export type ResolvedWorkflowMeta = {
  meta: WorkflowRuntimeMeta
  packageName: string | null
  resolvedName: string
}

/**
 * Resolves a workflow name against the root registry, then — for a
 * `namespace:name` form — against the addon package that claims the namespace.
 */
export const resolveWorkflowMeta = (
  name: string
): ResolvedWorkflowMeta | null => {
  const rootMeta = pikkuState(null, 'workflows', 'meta')
  if (rootMeta[name]) {
    return { meta: rootMeta[name], packageName: null, resolvedName: name }
  }

  const colonIndex = name.indexOf(':')
  if (colonIndex === -1) {
    return null
  }

  const namespace = name.substring(0, colonIndex)
  const localName = name.substring(colonIndex + 1)
  const addons = pikkuState(null, 'addons', 'packages')
  const pkgConfig = addons?.get(namespace)
  if (!pkgConfig) {
    return null
  }

  const addonMeta = pikkuState(pkgConfig.package, 'workflows', 'meta')
  if (!addonMeta?.[localName]) {
    return null
  }

  return {
    meta: addonMeta[localName],
    packageName: pkgConfig.package,
    resolvedName: localName,
  }
}
