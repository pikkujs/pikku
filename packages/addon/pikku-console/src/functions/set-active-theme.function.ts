import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'

export const setActiveTheme = pikkuFunc<{ id: string }, { activeId: string }>({
  title: 'Set Active Theme',
  description: 'Switches the application to another of its themes.',
  expose: true,
  scopes: ['pikku:console:design:write'],
  func: async ({ designService }, { id }) => {
    if (!designService) throw new LocalEnvironmentOnlyError('Only available in local development mode')
    return { activeId: await designService.setActiveTheme(id) }
  },
})
