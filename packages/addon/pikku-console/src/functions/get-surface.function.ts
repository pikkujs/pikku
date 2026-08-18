import { pikkuFunc } from '#pikku/addon/function'
import { readSurface } from '../lib/surface.js'
import type { SurfaceResult } from '../lib/surface.js'

export const getSurface = pikkuFunc<null, SurfaceResult>({
  title: 'Get Public Surface',
  description:
    'Returns the public surface as documentation: the doc @pikku/cli ships alongside itself, and the import counts the inspector measured for this project. Either half may be missing — an older CLI has no doc, a project that has never run prebuild has no usage — and each absence is an empty result.',
  expose: true,
  scopes: ['pikku:console:wirings:read'],
  func: async ({ metaService }) => readSurface(metaService),
})
