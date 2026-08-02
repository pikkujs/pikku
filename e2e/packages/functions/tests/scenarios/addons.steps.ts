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
import { expect } from '@pikku/playwright'

export const searchesAddons = pikkuScenarioStep<
  { query: string },
  { query: string }
>({
  name: 'searchesAddons',
  description: 'searches the addon gallery',
  template: 'searches for {query}',
  browser: async (_services, { query }, { browser }) => {
    await browser
      .locate({ testId: 'packages-search' })
      .first()
      .fill(query, { timeout: 15_000 })
    return { query }
  },
})

export const seesAddonCard = pikkuScenarioStep<
  { packageName: string; state?: 'installed' | 'available' },
  { visible: true }
>({
  name: 'seesAddonCard',
  description: 'sees an addon in the gallery',
  template: 'sees {state} addon {packageName}',
  browser: async (_services, { packageName, state }, { browser }) => {
    const card = browser.locate({
      testId: 'addon-card',
      where: { 'data-addon-package': packageName },
    })
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

/**
 * Counts the cards on show, exactly.
 *
 * The catalogue is served by this project's own registry stub from a fixture
 * it checks in, so the count is knowable — which is the point of the stub. A
 * lower bound would pass on a catalogue that had silently lost half its rows.
 */
export const countsAddonCards = pikkuScenarioStep<
  { count: number },
  { count: number }
>({
  name: 'countsAddonCards',
  description: 'counts the addons on show',
  template: 'sees exactly {count} addons on offer',
  browser: async (_services, { count }, { browser }) => {
    const cards = browser.locate({ testId: 'addon-card' })
    await expect(cards).toHaveCount(count, { timeout: 15_000 })
    return { count }
  },
})

/**
 * Opens one addon's drawer from the gallery.
 *
 * The card is addressed by the package it renders, which is the addon's
 * identity as declared in the catalogue. The drawer is confirmed open by the
 * instance-name field rather than by the drawer element: Mantine's `Drawer`
 * root stays attached and zero-sized whether it is open or shut, so waiting on
 * it would pass before anything had opened.
 */
export const opensAddonDrawer = pikkuScenarioStep<
  { packageName: string },
  { opened: string }
>({
  name: 'opensAddonDrawer',
  description: 'opens an addon drawer from the gallery',
  template: 'opens the drawer for {packageName}',
  browser: async (_services, { packageName }, { browser }) => {
    const card = browser
      .locate({
        testId: 'addon-card',
        where: { 'data-addon-package': packageName },
      })
      .first()
    await card.waitFor({ state: 'visible', timeout: 15_000 })
    await card.click()
    await browser
      .locate({ testId: 'addon-install-name' })
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 })
    return { opened: packageName }
  },
})

/**
 * Waits for a fresh install to land on the newly wired addon's setup.
 *
 * Both halves matter: the route carries the package id, and the Setup tab only
 * renders once the console has read the installed package back — which is the
 * part that depends on `pikku dev` finishing a re-inspection. The wait is
 * longer than the shared 15s for exactly that reason, and the tab is addressed
 * by test id rather than by its label, which is translated copy.
 */
export const landsOnAddonSetup = pikkuScenarioStep<
  { packageName: string },
  { url: string }
>({
  name: 'landsOnAddonSetup',
  description: 'lands on the setup of a freshly installed addon',
  template: 'lands on the setup for {packageName}',
  browser: async (_services, { packageName }, { browser }) => {
    await browser.page.waitForURL(
      (url) => url.href.includes(encodeURIComponent(packageName)),
      { timeout: 30_000 }
    )
    await browser
      .locate({ testId: 'package-tab-setup' })
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 })
    return { url: browser.page.url() }
  },
})
