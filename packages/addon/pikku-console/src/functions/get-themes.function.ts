import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import type { ThemeEntry, ThemeTokens } from '../services/design.service.js'

export const getThemes = pikkuFunc<
  null,
  { themes: ThemeEntry[]; activeId: string; tokens: ThemeTokens }
>({
  title: 'Get Themes',
  description: "Lists the project's Mantine themes, which one is active, and the token scales they share.",
  expose: true,
  scopes: ['pikku:console:design:read'],
  func: async ({ designService }) => {
    if (!designService) throw new LocalEnvironmentOnlyError('Only available in local development mode')
    return designService.listThemes()
  },
})
