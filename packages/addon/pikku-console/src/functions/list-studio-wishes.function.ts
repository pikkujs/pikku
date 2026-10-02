import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import type { WishList } from '../services/studio-host.service.js'

export const listStudioWishes = pikkuFunc<null, WishList>({
  title: 'List Wishes',
  description: 'The wish list shown while a project is set up. While it is being written the status is `generating`; poll until it is `ready`.',
  expose: true,
  scopes: ['pikku:console:wishes:read'],
  func: async ({ studioHost }) => {
    if (!studioHost) {
      throw new LocalEnvironmentOnlyError('Only available in local development mode')
    }
    return studioHost.wishes.list()
  },
})
