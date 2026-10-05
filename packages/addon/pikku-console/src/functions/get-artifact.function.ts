import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import type { ArtifactFull } from '../services/artifacts.service.js'

export const getArtifact = pikkuFunc<{ id: string }, { artifact: ArtifactFull | null }>({
  title: 'Get Artifact',
  description: 'One artifact, with its page or document content.',
  expose: true,
  scopes: ['pikku:console:artifacts:read'],
  func: async ({ artifactsService }, { id }) => {
    if (!artifactsService)
      throw new LocalEnvironmentOnlyError('Only available in local development mode')
    return { artifact: await artifactsService.get(id) }
  },
})
