import type { Locator, Page } from '@playwright/test'
import type { TestIdSelector } from '@pikku/core/scenario'

/**
 * Test-id resolution — the vocabulary every app's browser steps look elements
 * up with, written once here instead of rediscovered per app.
 *
 * `data-testid` alone is rarely enough to name one element:
 *
 * - `where` matches on the element's own data attributes, so a step asserts a
 *   status without reading the app's translated copy back to it.
 * - `prefix` matches a family (`feature-nav-*`), which is how a step counts or
 *   finds one of many.
 * - `containing` narrows to the match holding a piece of text, for rows whose
 *   identity is the data they render.
 * - `within` scopes the lookup to one section or row.
 */
export const testIdSelector = ({
  testId,
  prefix,
  where,
}: TestIdSelector): string => {
  const attributes = Object.entries(where ?? {})
    .map(([name, value]) => `[${name}="${value}"]`)
    .join('')
  const id = prefix ? `[data-testid^="${testId}"]` : `[data-testid="${testId}"]`
  return `${id}${attributes}`
}

export interface LocateTestIdOptions {
  /**
   * Match only rendered elements. On by default because Mantine layouts
   * routinely mount a hidden copy of a control — `ShellHeader` measures its
   * actions that way — so a bare test id resolves to two elements. Turn it off
   * for an absence check, which has to see the element it is waiting to lose.
   */
  visible?: boolean
}

/**
 * Resolve a `TestIdSelector` against a page or an enclosing locator.
 *
 * Returns the full match set, not `.first()`: a caller counting matches needs
 * all of them, and a caller acting on one can narrow it itself.
 */
export const locateTestId = (
  scope: Page | Locator,
  selector: TestIdSelector,
  { visible = true }: LocateTestIdOptions = {}
): Locator => {
  const container = selector.within
    ? locateTestId(scope, selector.within, { visible: false })
    : scope
  const suffix = visible ? ':visible' : ''
  const base = container.locator(`${testIdSelector(selector)}${suffix}`)
  return selector.containing
    ? base.filter({ hasText: selector.containing })
    : base
}
