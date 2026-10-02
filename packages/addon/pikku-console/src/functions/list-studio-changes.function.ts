import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import type {
  ChangeStatus,
  StudioChange,
  StudioMode,
} from '../services/studio-host.service.js'

export const listStudioChanges = pikkuFunc<
  { status?: ChangeStatus[] },
  { mode: StudioMode; changes: StudioChange[] }
>({
  title: 'List Changes',
  description:
    'The changes queue: local to this project, or the ones Fabric filed against the deployed app when the project is linked.',
  expose: true,
  scopes: ['pikku:console:changes:read'],
  func: async ({ studioHost }, { status }) => {
    if (!studioHost) {
      throw new LocalEnvironmentOnlyError('Only available in local development mode')
    }
    return { mode: studioHost.mode, changes: await studioHost.changes.list(status) }
  },
})
