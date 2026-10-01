import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import type { ComponentMeta } from '../services/design.service.js'

export const getComponentMeta = pikkuFunc<
  { componentName: string },
  ComponentMeta
>({
  title: 'Get Component Meta',
  description:
    "A Mantine component's props, variants, sizes and Styles API parts for the project's installed Mantine, with the active theme's custom variants.",
  expose: true,
  scopes: ['pikku:console:design:read'],
  func: async ({ designService }, { componentName }) => {
    if (!designService)
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    return designService.componentMeta(componentName)
  },
})
