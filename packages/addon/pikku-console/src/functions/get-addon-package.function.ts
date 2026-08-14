import { pikkuFunc } from '#pikku'
import type { AddonPackageInfo } from '../services/addon.service.js'

export const getAddonCommunityPackage = pikkuFunc<
  { id: string },
  AddonPackageInfo | null
>({
  title: 'Get Community Addon Package',
  description:
    'Returns the full details of a community addon by ID from the registry',
  expose: true,
  scopes: ['pikku:console:addons:read'],
  func: async ({ addonService }, { id }) => {
    return await addonService.readAddon(id)
  },
})
