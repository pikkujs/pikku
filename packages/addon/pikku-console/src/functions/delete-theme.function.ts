import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'

export const deleteTheme = pikkuFunc<{ id: string }, { activeId: string }>({
  title: 'Delete Theme',
  description: 'Deletes a theme; deleting the active one switches the application back to the default.',
  expose: true,
  scopes: ['pikku:console:design:write'],
  func: async ({ designService }, { id }) => {
    if (!designService) throw new LocalEnvironmentOnlyError('Only available in local development mode')
    return { activeId: await designService.deleteTheme(id) }
  },
})
