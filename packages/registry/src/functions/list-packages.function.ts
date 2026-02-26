import { pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'
import type { ListResult } from '../types.js'

export const listPackages = pikkuSessionlessFunc<null, ListResult>({
  auth: false,
  func: async ({ registryService }) => {
    return await registryService.listPackages()
  },
})
