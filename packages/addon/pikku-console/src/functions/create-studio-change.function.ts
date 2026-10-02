import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import type { StudioChange } from '../services/studio-host.service.js'

export const createStudioChange = pikkuFunc<
  { title: string; body?: string; route?: string },
  StudioChange
>({
  title: 'File a Change',
  description: 'Adds a change to a local project’s queue.',
  expose: true,
  scopes: ['pikku:console:changes:write'],
  func: async ({ studioHost }, input) => {
    if (!studioHost) {
      throw new LocalEnvironmentOnlyError('Only available in local development mode')
    }
    return studioHost.changes.create(input)
  },
})
