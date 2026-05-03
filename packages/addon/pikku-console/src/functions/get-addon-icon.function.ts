import { pikkuSessionlessFunc } from '#pikku'

export const getAddonIcon = pikkuSessionlessFunc<
  { alias: string },
  string | null
>({
  title: 'Get Addon Icon',
  description: 'Returns the icon for an addon from its metadata',
  expose: true,
  auth: false,
  func: async ({ addonService }, { alias }) => {
    const pkg = await addonService.readAddon(alias)
    return pkg?.icon ?? null
  },
})
