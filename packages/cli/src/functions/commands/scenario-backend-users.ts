import type { ResolvedVirtualUser } from '@pikku/core/services'

/**
 * Splits virtual users by the backend they sign into. A user that names none
 * belongs to `defaultBackend`, the backend the run environment resolved to.
 * Insertion order is kept so the first user stays the first.
 */
export const groupVirtualUsersByBackend = (
  users: Record<string, ResolvedVirtualUser>,
  defaultBackend: string
): Map<string, Record<string, ResolvedVirtualUser>> => {
  const groups = new Map<string, Record<string, ResolvedVirtualUser>>()
  for (const [id, user] of Object.entries(users)) {
    const backend = user.backend ?? defaultBackend
    const group = groups.get(backend) ?? {}
    group[id] = user
    groups.set(backend, group)
  }
  return groups
}
