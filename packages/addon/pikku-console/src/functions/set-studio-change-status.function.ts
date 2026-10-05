import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import type { StudioChange } from '../services/studio-host.service.js'

export const setStudioChangeStatus = pikkuFunc<
  { changeId: string; status: 'open' | 'in_progress' | 'dismissed' },
  StudioChange
>({
  title: 'Move a Change',
  description: 'Reopens, starts or dismisses a change.',
  expose: true,
  scopes: ['pikku:console:changes:write'],
  func: async ({ studioHost }, { changeId, status }) => {
    if (!studioHost) {
      throw new LocalEnvironmentOnlyError('Only available in local development mode')
    }
    return studioHost.changes.setStatus(changeId, status)
  },
})
