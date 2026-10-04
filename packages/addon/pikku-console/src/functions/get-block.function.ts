import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import type { BlockDetail } from '../services/design.service.js'

export const getBlock = pikkuFunc<{ name: string }, BlockDetail>({
  title: 'Get Block',
  description:
    'One block with every block it composes: the files to copy into one folder, the i18n keys to add and any npm packages it needs.',
  expose: true,
  scopes: ['pikku:console:design:read'],
  func: async ({ designService }, { name }) => {
    if (!designService)
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    return designService.getBlock(name)
  },
})
