import { pikkuFunc } from '#pikku/addon/function'

export type CredentialUserEntry = {
  userId: string
  credentials: Record<string, boolean>
}

/**
 * Keyed by the credentials each user actually holds rather than by the declared
 * set, because the declared set lives in the generated metadata on disk and this
 * addon must run where there is no disk. A name absent from the record reads as
 * `false` at the only place it is used — a lookup per declared credential, which
 * the caller already has from the application metadata.
 */
export const credentialListUsers = pikkuFunc<
  null,
  { users: CredentialUserEntry[] }
>({
  title: 'List Credential Users',
  description:
    'Lists all users together with the credentials each of them has configured.',
  expose: true,
  scopes: ['admin:credentials:read'],
  func: async ({ credentialService }) => {
    if (!credentialService) {
      return { users: [] }
    }

    const users: CredentialUserEntry[] = []
    for (const userId of await credentialService.getAllUsers()) {
      const held = await credentialService.getAll(userId)
      users.push({
        userId,
        credentials: Object.fromEntries(
          Object.keys(held).map((name) => [name, true])
        ),
      })
    }

    return { users }
  },
})
