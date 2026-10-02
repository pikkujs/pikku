import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import type { StudioChange } from '../services/studio-host.service.js'

export const completeStudioChange = pikkuFunc<
  { changeId: string; note?: string },
  StudioChange
>({
  title: 'Complete a Change',
  description: 'Marks a change done, with an optional note on what was done.',
  expose: true,
  scopes: ['pikku:console:changes:write'],
  func: async ({ studioHost }, { changeId, note }) => {
    if (!studioHost) {
      throw new LocalEnvironmentOnlyError('Only available in local development mode')
    }
    return studioHost.changes.complete(changeId, note)
  },
})
