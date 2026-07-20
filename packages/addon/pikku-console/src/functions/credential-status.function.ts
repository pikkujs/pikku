import { pikkuFunc } from '#pikku'

export const credentialStatus = pikkuFunc<
  { names: string[]; userId?: string },
  { statuses: Record<string, boolean> }
>({
  title: 'Credential Status',
  description:
    'Checks which of the given credential names are configured. Optionally scoped to a user.',
  expose: true,
  func: async ({ credentialService }, { names, userId }) => {
    const statuses: Record<string, boolean> = {}
    for (const name of names) {
      statuses[name] = await credentialService.has(name, userId)
    }
    return { statuses }
  },
})
