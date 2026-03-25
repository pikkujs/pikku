import { pikkuSessionlessFunc } from '#pikku'

export type CredentialUserEntry = {
  userId: string
  credentials: Record<string, boolean>
}

export const credentialListUsers = pikkuSessionlessFunc<
  null,
  { users: CredentialUserEntry[] }
>({
  title: 'List Credential Users',
  description:
    'Lists all users and their credential status for each declared credential.',
  expose: true,
  func: async ({ credentialService, wiringService }) => {
    if (!credentialService) {
      return { users: [] }
    }

    const credentialsMeta = await wiringService.readCredentialsMeta()
    const credentialNames = Object.keys(credentialsMeta)
    const allUserIds = await credentialService.getAllUsers()

    const users: CredentialUserEntry[] = []
    for (const userId of allUserIds) {
      const userCreds = await credentialService.getAll(userId)
      const credentials: Record<string, boolean> = {}
      for (const name of credentialNames) {
        credentials[name] = name in userCreds
      }
      users.push({ userId, credentials })
    }

    return { users }
  },
})
