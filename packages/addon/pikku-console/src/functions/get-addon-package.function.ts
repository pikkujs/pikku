import { pikkuSessionlessFunc } from '#pikku'
import type { AddonDetail } from '../services/addon.service.js'

export const getAddonPackage = pikkuSessionlessFunc<
  { id: string },
  AddonDetail | null
>({
  title: 'Get Addon Package',
  description:
    'Returns the full details of a single addon by ID, including readme and repository information',
  expose: true,
  auth: false,
  func: async ({ addonService }, { id }) => {
    return await addonService.readAddon(id)
  },
})
