import type { getFabricRPC } from './http.js'
import { FabricPreconditionError } from './errors.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Turn `--organization` into an id. Fabric derives the owning org from the
 * session when the flag is absent, which silently imports into whichever org
 * the token happens to be scoped to — the flag is how a repo belonging to a
 * different org gets linked without re-logging-in.
 */
export async function resolveOrganizationId(
  rpc: ReturnType<typeof getFabricRPC>,
  organization: string | undefined
): Promise<string | undefined> {
  if (!organization) return undefined
  if (UUID.test(organization)) return organization

  const { organizations } = await rpc.invoke('listMyOrganizations', {})
  const wanted = organization.toLowerCase()
  const matches = organizations.filter(
    (org) =>
      org.slug.toLowerCase() === wanted || org.name.toLowerCase() === wanted
  )

  if (matches.length === 0) {
    const known = organizations.map((org) => org.slug).join(', ')
    throw new FabricPreconditionError(
      `No organization named "${organization}".\nYou belong to: ${known || '(none)'}`
    )
  }
  if (matches.length > 1) {
    const ids = matches.map((org) => org.organizationId).join(', ')
    throw new FabricPreconditionError(
      `"${organization}" matches more than one organization. Pass the id instead: ${ids}`
    )
  }
  return matches[0]!.organizationId
}
