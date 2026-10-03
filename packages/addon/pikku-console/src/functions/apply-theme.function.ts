import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import type { ThemeInput } from '../services/design.service.js'

export const applyTheme = pikkuFunc<ThemeInput, { activeId: string; emails: boolean }>({
  title: 'Apply Theme',
  description:
    'Writes a theme from a preset, with any colours, fonts, structure, page and ink layered over it, and makes it active. Also re-brands emails/theme.json when the project has one.',
  expose: true,
  scopes: ['pikku:console:design:write'],
  func: async ({ designService }, input) => {
    if (!designService) throw new LocalEnvironmentOnlyError('Only available in local development mode')
    return designService.applyTheme(input)
  },
})
