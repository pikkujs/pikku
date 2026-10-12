import { existsSync, readFileSync } from 'node:fs'

export type ElementKind =
  'buttons' | 'fields' | 'links' | 'tabs' | 'tables' | 'menus'

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
