import { pikkuService } from '@pikku/core/pikku-service'

/** Declared, never opted in to: its module must not appear in any generated file. */
export const unused = pikkuService({
  dev: () => ({ unused: true }),
})
