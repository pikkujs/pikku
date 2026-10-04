import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import type { ThemeSpec, ThemeTokens } from '../services/design.service.js'

export const getThemeSpec = pikkuFunc<null, { id: string; spec: ThemeSpec; tokens: ThemeTokens }>({
  title: 'Get Theme Spec',
  description: 'Reads the active theme: its brand colours and fonts, and its structure.',
  expose: true,
  scopes: ['pikku:console:design:read'],
  func: async ({ designService }) => {
    if (!designService) throw new LocalEnvironmentOnlyError('Only available in local development mode')
    return designService.getThemeSpec()
  },
})
