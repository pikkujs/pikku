import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'

export const getMantineComponents = pikkuFunc<
  null,
  { mantineVersion: string | null; components: string[] }
>({
  title: 'Get Mantine Components',
  description:
    'Lists the Mantine components the bundled metadata covers for the installed Mantine major.',
  expose: true,
  scopes: ['pikku:console:design:read'],
  func: async ({ designService }) => {
    if (!designService)
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    return designService.mantineComponents()
  },
})
