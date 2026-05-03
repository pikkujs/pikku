import { pikkuSessionlessFunc } from '#pikku'
import type { AddonPackageInfo } from '../services/addon.service.js'

export const getAddonCommunityPackage = pikkuSessionlessFunc<
  { id: string },
  AddonPackageInfo | null
>({
  description:
    'Returns the full details of a community addon by ID from the registry',
  expose: true,
  auth: false,
  func: async ({ addonService }, { id }) => {
    return await addonService.readAddon(id)
  },
})
