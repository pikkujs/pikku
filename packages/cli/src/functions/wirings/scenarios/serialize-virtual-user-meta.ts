import type {
  VirtualUserDisposition,
  VirtualUsersMeta,
} from '@pikku/core/virtual-user'
import type { InspectorVirtualUser } from '@pikku/inspector'

/**
 * The virtual user meta the CLI runs from and the console renders.
 *
 * A declaration is entirely literal, so this is the whole thing — no runtime
 * registration, no object identity, nothing to resolve once the app is loaded.
 * That is what lets `pikku virtual-user run <name>` and the console describe a
 * virtual user without importing a line of the project.
 *
 * Defaults are applied here rather than at the call site so every consumer sees
 * the same user: an undeclared disposition is `realistic`, and the export
 * identifier is the id and the fallback name.
 */
export const buildVirtualUsersMeta = (
  virtualUserFiles: Map<string, InspectorVirtualUser>
): VirtualUsersMeta => {
  const meta: VirtualUsersMeta = {}

  for (const [id, user] of virtualUserFiles) {
    meta[id] = {
      id,
      name: user.name ?? id,
      ...(user.description ? { description: user.description } : {}),
      actor: user.actor,
      disposition: (user.disposition ?? 'realistic') as VirtualUserDisposition,
      // Left as declared rather than merged over the profile here: the console
      // and the report want to show what was overridden, not just the result.
      ...(user.tuning ? { tuning: user.tuning } : {}),
      goals: user.goals ?? [],
      tags: user.tags ?? [],
      ...(user.budget ? { budget: user.budget } : {}),
      ...(user.grants ? { grants: user.grants } : {}),
      ...(user.allowApprovalRequired !== undefined
        ? { allowApprovalRequired: user.allowApprovalRequired }
        : {}),
      ...(user.fixtures ? { fixtures: user.fixtures } : {}),
    }
  }

  return meta
}
