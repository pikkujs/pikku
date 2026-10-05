import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'

export const getUiComponents = pikkuFunc<
  null,
  { components: string[] }
>({
  title: 'Get UI Components',
  description:
    'Lists the shadcn components in the src/components/ui folder of the app.',
  expose: true,
  scopes: ['pikku:console:design:read'],
  func: async ({ designService }) => {
    if (!designService)
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    return designService.uiComponents()
  },
})
