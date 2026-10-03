import { pikkuFunc } from '#pikku/addon/function'
import type { StudioMode } from '../services/studio-host.service.js'

export const getStudioHost = pikkuFunc<
  null,
  { mode: StudioMode | null; projectId: string | null }
>({
  title: 'Get Studio Host',
  description:
    'Whether this project is local or linked to Fabric, which decides where changes, wishes and models come from.',
  expose: true,
  scopes: ['pikku:console:changes:read'],
  func: async ({ studioHost }) => ({
    mode: studioHost?.mode ?? null,
    projectId: studioHost?.projectId ?? null,
  }),
})
