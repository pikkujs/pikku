import { pikkuSessionlessFunc } from '#pikku'

export const getExternalIcon = pikkuSessionlessFunc<
  { alias: string },
  string | null
>({
  title: 'Get External Icon',
  description: 'Returns the icon for an external package from its metadata',
  expose: true,
  auth: false,
  func: async ({ externalService }, { alias }) => {
    const pkg = await externalService.readExternalPackage(alias)
    return pkg?.icon ?? null
  },
})
