export type AddonFilter = { addon?: string }

export const namespaceOf = (name: string | undefined): string | undefined => {
  if (!name) return undefined
  const index = name.indexOf(':')
  return index > 0 ? name.slice(0, index) : undefined
}

export const belongsToAddon = (
  name: string | undefined,
  addon: string | undefined
): boolean => !addon || namespaceOf(name) === addon

export const filterListByAddon = <T>(
  items: T[],
  addon: string | undefined,
  nameOf: (item: T) => string | undefined
): T[] =>
  addon ? items.filter((item) => belongsToAddon(nameOf(item), addon)) : items

export const filterRecordByAddon = <T>(
  record: Record<string, T>,
  addon: string | undefined,
  nameOf: (key: string, value: T) => string | undefined = (key) => key
): Record<string, T> =>
  addon
    ? Object.fromEntries(
        Object.entries(record).filter(([key, value]) =>
          belongsToAddon(nameOf(key, value), addon)
        )
      )
    : record

export const addonNames = (
  names: string[],
  addon: string | undefined
): string[] => filterListByAddon(names, addon, (name) => name)

export const pageOf = <T>(
  items: T[],
  options: { limit?: number; offset?: number } | undefined
): T[] => {
  const offset = Math.max(0, options?.offset ?? 0)
  return options?.limit === undefined
    ? items.slice(offset)
    : items.slice(offset, offset + Math.max(0, options.limit))
}
