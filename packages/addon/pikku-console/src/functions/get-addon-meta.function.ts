import { pikkuFunc } from '#pikku'
import type {
  AddonMetaPage,
  AddonMetaQuery,
} from '../services/addon.service.js'

export const getAddonMeta = pikkuFunc<AddonMetaQuery | null, AddonMetaPage>({
  title: 'Get Addon Metadata',
  description:
    'Returns one page of the addon catalogue. Search, category and sort are applied by the registry rather than the caller, so they cover every package and not just the pages already loaded.',
  expose: true,
  func: async ({ addonService }, input) => {
    return await addonService.readAddonsMeta(input ?? {})
  },
})
