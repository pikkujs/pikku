import { pikkuSessionlessFunc } from '#pikku/function'

export const readsSingletonsOnly = pikkuSessionlessFunc<void, string>(
  async ({ logger }) => {
    logger.debug('reads a singleton service only')
    return 'singleton'
  }
)

export const readsWireService = pikkuSessionlessFunc<void, string>(
  async ({ requestStamp }) => requestStamp.id
)
