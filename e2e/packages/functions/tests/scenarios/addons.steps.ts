/**
 * Scenario steps for the console addons page.
 *
 * These replace the cucumber glue in tests/steps/addons.steps.ts. That glue
 * still waits for a `table` the page stopped rendering when the addons gallery
 * became cards, so it fails before its first assertion; these steps target the
 * gallery as it is, through `data-testid` rather than i18n copy or Mantine
 * internals. The page itself is reached with the shared `opensConsolePage`
 * step, so everything here acts on a surface that page already rendered.
 */
import { pikkuScenarioStep } from '#pikku/workflow/pikku-workflow-types.gen.js'
import type {} from '@pikku/playwright'

export const searchesAddons = pikkuScenarioStep<
  { query: string },
  { query: string },
  true
>({
  name: 'searchesAddons',
  description: 'searches the addon gallery',
  template: 'searches for {query}',
  browser: true,
  func: async (_services, { query }, { browser }) => {
    await browser.page
      .locator('[data-testid="packages-search"]:visible')
      .first()
      .fill(query, { timeout: 15_000 })
    return { query }
  },
})

export const seesAddonCard = pikkuScenarioStep<
  { packageName: string; state?: 'installed' | 'available' },
  { visible: true },
  true
>({
  name: 'seesAddonCard',
  description: 'sees an addon in the gallery',
  template: 'sees {state} addon {packageName}',
  browser: true,
  func: async (_services, { packageName, state }, { browser }) => {
    const card = browser.page.locator(
      `[data-testid="addon-card"][data-addon-package="${packageName}"]`
    )
    await card.first().waitFor({ state: 'visible', timeout: 15_000 })
    if (state !== undefined) {
      const marked =
        (await card.first().getAttribute('data-addon-installed')) === 'true'
      if (marked !== (state === 'installed')) {
        throw new Error(
          `Expected ${packageName} to be ${state}, the gallery says otherwise`
        )
      }
    }
    return { visible: true }
  },
})

export const countsAddonCards = pikkuScenarioStep<
  { atLeast: number },
  { count: number },
  true
>({
  name: 'countsAddonCards',
  description: 'counts the addons on show',
  template: 'sees at least {atLeast} addons on offer',
  browser: true,
  func: async (_services, { atLeast }, { browser }) => {
    const cards = browser.page.locator('[data-testid="addon-card"]')
    await cards.first().waitFor({ state: 'visible', timeout: 15_000 })
    const count = await cards.count()
    if (count < atLeast) {
      throw new Error(
        `Expected at least ${atLeast} addons on show, got ${count}`
      )
    }
    return { count }
  },
})
