// Better Auth organization-plugin client helpers, in the same thin-async-wrapper
// style as src/lib/auth.ts. The organization UI blocks call these instead of the
// raw client so error handling lives in one place.
//
// Enabling the plugin: this needs `organization()` in your betterAuth({ plugins })
// (packages/functions/src/auth.ts) and its migration. If you already have an authClient in
// src/lib/auth.ts, add `organizationClient()` to ITS plugins and move these
// wrappers there; this standalone client works too.
import { createAuthClient } from 'better-auth/client'
import { organizationClient } from 'better-auth/client/plugins'
import { apiUrl } from '@/lib/env'

const makeClient = () =>
  createAuthClient({ baseURL: `${apiUrl()}/auth`, plugins: [organizationClient()] })
let _client: ReturnType<typeof makeClient> | null = null
// Lazy: createAuthClient validates baseURL with new URL() at construction, which
// crashes SSR where apiUrl() is a relative placeholder. Every caller is client-side.
const org = () => (_client ??= makeClient())

export type OrgRole = 'member' | 'admin' | 'owner'

export async function inviteMember(input: {
  email: string
  role: OrgRole
  organizationId?: string
}) {
  const { error } = await org().organization.inviteMember(input)
  if (error) throw new Error(error.message ?? 'Unable to send invitation')
}

export async function listMembers(organizationId?: string) {
  const { data, error } = await org().organization.listMembers({
    query: organizationId ? { organizationId } : {},
  })
  if (error) throw new Error(error.message ?? 'Unable to load members')
  return data?.members ?? []
}

export async function removeMember(memberIdOrEmail: string, organizationId?: string) {
  const { error } = await org().organization.removeMember({ memberIdOrEmail, organizationId })
  if (error) throw new Error(error.message ?? 'Unable to remove member')
}

export async function acceptInvitation(invitationId: string) {
  const { error } = await org().organization.acceptInvitation({ invitationId })
  if (error) throw new Error(error.message ?? 'Unable to accept invitation')
}

export async function rejectInvitation(invitationId: string) {
  const { error } = await org().organization.rejectInvitation({ invitationId })
  if (error) throw new Error(error.message ?? 'Unable to decline invitation')
}

export async function createOrganization(input: { name: string; slug: string }) {
  const { error } = await org().organization.create(input)
  if (error) throw new Error(error.message ?? 'Unable to create organization')
}

export async function setActiveOrganization(organizationId: string) {
  const { error } = await org().organization.setActive({ organizationId })
  if (error) throw new Error(error.message ?? 'Unable to switch organization')
}

export async function listOrganizations() {
  const { data, error } = await org().organization.list()
  if (error) throw new Error(error.message ?? 'Unable to load organizations')
  return data ?? []
}
