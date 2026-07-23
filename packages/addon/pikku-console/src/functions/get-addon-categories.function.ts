import { pikkuFunc } from '#pikku'

export const getAddonCategories = pikkuFunc<null, Record<string, number>>({
  title: 'Get Addon Categories',
  description:
    'Category counts across the whole addon catalogue, for the gallery category rail. Counted by the registry — deriving them from the loaded rows would undercount everything the user has not scrolled to yet.',
  expose: true,
  func: async ({ addonService }) => {
    return await addonService.readAddonCategories()
  },
})
