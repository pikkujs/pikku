import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import type { ThemeSpecPatch } from '../services/design.service.js'

export const updateThemeSpec = pikkuFunc<ThemeSpecPatch, { ok: true }>({
  title: 'Update Theme Spec',
  description:
    'Merges colours, fonts, radius, density, shadows, page and ink into the active theme and regenerates theme.css.',
  expose: true,
  scopes: ['pikku:console:design:write'],
  func: async ({ designService }, patch) => {
    if (!designService) throw new LocalEnvironmentOnlyError('Only available in local development mode')
    await designService.updateThemeSpec(patch)
    return { ok: true as const }
  },
})
