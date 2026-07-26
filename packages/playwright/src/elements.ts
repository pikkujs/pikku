import { existsSync, readFileSync } from 'node:fs'

/**
 * Element registry — explicit `name → selector` maps, registered upfront and
 * grouped by element kind:
 *
 *   {
 *     "buttons": { "Buy": "[data-testid=action-buy-product]" },
 *     "fields":  { "Course name": "[data-testid=field-course-name]" },
 *     "tables":  { "Bookings": "[data-testid=table-bookings]" }
 *   }
 *
 * The registry is meant to be GENERATED from the app's data-testids (the
 * scaffold emits them deterministically), so feature files use a closed
 * vocabulary of element names and a dry run can reject unknown ones. Names
 * not in the registry fall back to the Mantine-aware heuristics in
 * locators.ts, so adoption is incremental.
 */
export type ElementKind =
  | 'buttons'
  | 'fields'
  | 'links'
  | 'tabs'
  | 'tables'
  | 'menus'

export type ElementMap = Partial<Record<ElementKind, Record<string, string>>>

/** Load the app's element registry (generated JSON); absent file → empty map. */
export function loadElementMap(file?: string): ElementMap {
  const path = file ?? process.env.E2E_ELEMENTS ?? 'tests/support/elements.json'
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ElementMap
  } catch (err) {
    throw new Error(
      `[e2e] element map ${path} is not valid JSON: ${(err as Error).message}`
    )
  }
}

/** Look a name up across the given kinds, in order. */
export function registered(
  elements: ElementMap | undefined,
  kinds: ElementKind[],
  name: string
): string | undefined {
  for (const kind of kinds) {
    const selector = elements?.[kind]?.[name]
    if (selector) return selector
  }
  return undefined
}
