import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'

export const createTheme = pikkuFunc<{ id: string; name: string }, { activeId: string }>({
  title: 'Create Theme',
  description: 'Copies the active theme under a new id and name, and makes the copy active.',
  expose: true,
  scopes: ['pikku:console:design:write'],
  func: async ({ designService }, { id, name }) => {
    if (!designService) throw new LocalEnvironmentOnlyError('Only available in local development mode')
    return { activeId: await designService.createTheme(id, name) }
  },
})
