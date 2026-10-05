import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import type { ArtifactSummary } from '../services/artifacts.service.js'

export const listArtifacts = pikkuFunc<null, { artifacts: ArtifactSummary[] }>({
  title: 'List Artifacts',
  description:
    'The designs, pages and documents the builder has made for the project, newest first.',
  expose: true,
  scopes: ['pikku:console:artifacts:read'],
  func: async ({ artifactsService }) => {
    if (!artifactsService)
      throw new LocalEnvironmentOnlyError('Only available in local development mode')
    return { artifacts: await artifactsService.list() }
  },
})
