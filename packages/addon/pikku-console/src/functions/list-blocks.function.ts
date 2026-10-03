import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import type { BlockSummary } from '../services/design.service.js'

export const listBlocks = pikkuFunc<
  { tag?: string },
  { tags: Array<{ tag: string; count: number }>; blocks: BlockSummary[] }
>({
  title: 'List Blocks',
  description:
    'Lists the ready-made shadcn page sections an app can copy, with their tags, optionally only one tag.',
  expose: true,
  scopes: ['pikku:console:design:read'],
  func: async ({ designService }, { tag }) => {
    if (!designService)
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    return designService.listBlocks(tag)
  },
})
