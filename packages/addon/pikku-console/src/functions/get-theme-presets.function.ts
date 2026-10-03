import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import type { ThemePreset } from '../services/design.service.js'

export const getThemePresets = pikkuFunc<null, { presets: ThemePreset[] }>({
  title: 'Get Theme Presets',
  description: 'Lists the curated looks a theme can start from, with swatch colours and the scheme each sits on.',
  expose: true,
  scopes: ['pikku:console:design:read'],
  func: async ({ designService }) => {
    if (!designService) throw new LocalEnvironmentOnlyError('Only available in local development mode')
    return { presets: designService.presets() }
  },
})
