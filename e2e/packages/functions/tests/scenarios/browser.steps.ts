/**
 * The generic browser verbs the console scenarios share.
 *
 * Anything here is true of any page: see text, click a control, read a field.
 * Anything that knows what a page *means* belongs in that page's own step file.
 *
 * Two console-wide facts every one of these has to respect:
 *
 * - `ShellHeader` renders a hidden `visibility: hidden` measurement copy of its
 *   actions, so every header control matches twice. `:visible` is not defensive
 *   noise here, it is what makes a header locator resolve to one element.
 * - The console's copy goes through the `m` i18n namespace, so a step that
 *   selects on rendered English breaks the moment the console is translated.
 *   Prefer a role, a testid or a stable attribute; take text only when the text
 *   is the subject of the assertion.
 */
import { pikkuScenarioStep } from '#pikku/workflow/pikku-workflow-types.gen.js'
import type { TestIdSelector } from '@pikku/core/workflow'
import { expect } from '@pikku/playwright'

const TIMEOUT = 15_000

/**
 * Where an element is looked up: its test id, optionally as a prefix, plus the
 * data attributes it has to carry. Attributes are how a status is asserted
 * without reading the console's own translated copy back to it.
 *
 * `containing` narrows to the one match holding a piece of text, for the rows
 * whose identity is the data they display — a user's email is rendered anyway,
 * so matching on it adds no attribute for a scraper or a session recorder to
 * pick up, which putting the same value in a `data-` attribute would.
 *
 * The vocabulary and its resolution are `@pikku/core` and `@pikku/playwright`:
 * `browser.locate(selector)` is the same in every app. Re-exported here so the
 * step files that build these selectors keep one import.
 */
export type { TestIdSelector }

export const seesText = pikkuScenarioStep<
  { text: string },
  { visible: true },
  true
>({
  name: 'seesText',
  description: 'sees a piece of text on the page',
  template: 'sees {text}',
  browser: true,
  func: async (_services, { text }, { browser }) => {
    await browser.page
      .getByText(text, { exact: false })
      .first()
      .waitFor({ state: 'visible', timeout: TIMEOUT })
    return { visible: true }
  },
})

/**
 * Waits for the text to be absent.
 *
 * A negative is only meaningful once the page has settled, so this waits for
 * the locator to detach rather than asking once and passing on a page that had
 * not rendered yet.
 */
export const doesNotSeeText = pikkuScenarioStep<
  { text: string },
  { absent: true },
  true
>({
  name: 'doesNotSeeText',
  description: 'expects a piece of text to be absent',
  template: 'does not see {text}',
  browser: true,
  func: async (_services, { text }, { browser }) => {
    await browser.page
      .getByText(text, { exact: false })
      .first()
      .waitFor({ state: 'detached', timeout: TIMEOUT })
    return { absent: true }
  },
})

export const clicksButton = pikkuScenarioStep<
  { name: string },
  { clicked: string },
  true
>({
  name: 'clicksButton',
  description: 'clicks a button by its accessible name',
  template: 'clicks the {name} button',
  browser: true,
  func: async (_services, { name }, { browser }) => {
    await browser.page
      .getByRole('button', { name })
      .filter({ visible: true })
      .first()
      .click({ timeout: TIMEOUT })
    return { clicked: name }
  },
})

export const clicksLink = pikkuScenarioStep<
  { name: string },
  { clicked: string },
  true
>({
  name: 'clicksLink',
  description: 'clicks a link by its accessible name',
  template: 'clicks the {name} link',
  browser: true,
  func: async (_services, { name }, { browser }) => {
    await browser.page
      .getByRole('link', { name })
      .first()
      .click({ timeout: TIMEOUT })
    return { clicked: name }
  },
})

export const clicksTestId = pikkuScenarioStep<
  {
    testId: string
    /** Match every test id beginning with `testId`, e.g. every `flow-card-*`. */
    prefix?: boolean
    where?: Record<string, string>
    containing?: string
    /** Scopes the lookup to one element, e.g. the row for one user. */
    within?: TestIdSelector
  },
  { clicked: string },
  true
>({
  name: 'clicksTestId',
  description: 'clicks an element by its test id',
  template: 'clicks {testId}',
  browser: true,
  func: async (
    _services,
    { testId, prefix, where, containing, within },
    { browser }
  ) => {
    const target = browser.locate({
      testId,
      prefix,
      where,
      containing,
      within,
    })
    await target.first().click({ timeout: TIMEOUT })
    return { clicked: containing ? `${testId}:${containing}` : testId }
  },
})

export const seesTestId = pikkuScenarioStep<
  {
    testId: string
    /** Match every test id beginning with `testId`, e.g. every `flow-card-*`. */
    prefix?: boolean
    containing?: string
    /**
     * Data attributes the element must also carry, e.g.
     * `{ 'data-connected': 'false' }`. This is how a status is asserted without
     * reading the console's own translated copy back to it.
     */
    where?: Record<string, string>
    /** Scopes the lookup to one element, e.g. the row for one user. */
    within?: TestIdSelector
    count?: number
    atLeast?: number
    /** Overrides the default wait, for a state that arrives via a redirect. */
    timeoutMs?: number
  },
  { count: number },
  true
>({
  name: 'seesTestId',
  description: 'sees an element with a given test id',
  template: 'sees {testId}',
  browser: true,
  func: async (
    _services,
    { testId, prefix, containing, where, within, count, atLeast, timeoutMs },
    { browser }
  ) => {
    const target = browser.locate({
      testId,
      prefix,
      where,
      containing,
      within,
    })
    await target
      .first()
      .waitFor({ state: 'visible', timeout: timeoutMs ?? TIMEOUT })
    const found = await target.count()
    if (count !== undefined && found !== count) {
      throw new Error(`Expected ${count} ${testId} element(s), got ${found}`)
    }
    if (atLeast !== undefined && found < atLeast) {
      throw new Error(
        `Expected at least ${atLeast} ${testId} element(s), got ${found}`
      )
    }
    return { count: found }
  },
})

export const doesNotSeeTestId = pikkuScenarioStep<
  {
    testId: string
    where?: Record<string, string>
    containing?: string
  },
  { absent: true },
  true
>({
  name: 'doesNotSeeTestId',
  description: 'expects an element with a given test id to be absent',
  template: 'does not see {testId}',
  browser: true,
  func: async (_services, { testId, where, containing }, { browser }) => {
    await browser
      .locate({ testId, where, containing }, { visible: false })
      .first()
      .waitFor({ state: 'detached', timeout: TIMEOUT })
    return { absent: true }
  },
})

/**
 * Picks an option on a Mantine `SegmentedControl`.
 *
 * Mantine renders the option's `<input type="radio">` as a *sibling* of its
 * `<label>`, so `label:has(input[value=x])` never matches; the label's `for` is
 * `<uuid>-<value>`, which is both matchable and — unlike the rendered option
 * text — immune to the console's translations.
 */
export const selectsSegment = pikkuScenarioStep<
  { value: string },
  { selected: string },
  true
>({
  name: 'selectsSegment',
  description: 'picks an option on a segmented control',
  template: 'switches to {value}',
  browser: true,
  func: async (_services, { value }, { browser }) => {
    await browser.page
      .locator(`label[for$="-${value}"]:visible`)
      .first()
      .click({ timeout: TIMEOUT })
    return { selected: value }
  },
})

/**
 * Picks a view on the page header's own switch, which is a `role="tablist"` of
 * buttons rather than a Mantine `SegmentedControl` — a different control with a
 * different DOM, so it gets its own step rather than a selector that guesses.
 *
 * The option is addressed by its value, which is declared in code, and never by
 * its label, which is translated.
 */
export const selectsTab = pikkuScenarioStep<
  { value: string },
  { selected: string },
  true
>({
  name: 'selectsTab',
  description: 'picks a view on the page header switch',
  template: 'switches to the {value} view',
  browser: true,
  func: async (_services, { value }, { browser }) => {
    await browser
      .locate({ testId: 'switch-tab', where: { 'data-value': value } })
      .first()
      .click({ timeout: TIMEOUT })
    return { selected: value }
  },
})

export const readsTestIdText = pikkuScenarioStep<
  { testId: string },
  { text: string },
  true
>({
  name: 'readsTestIdText',
  description: 'reads the text of an element by its test id',
  template: 'reads {testId}',
  browser: true,
  func: async (_services, { testId }, { browser }) => {
    const target = browser.locate({ testId }).first()
    await target.waitFor({ state: 'visible', timeout: TIMEOUT })
    return { text: (await target.textContent()) ?? '' }
  },
})

/**
 * Finds a table row by its content, and optionally asserts a second cell.
 *
 * The console's list tables carry no test ids, but a row keyed on the record's
 * own name is not i18n-coupled — the name comes from the project, not from the
 * console's copy — so this stays stable without touching the console.
 */
export const seesTableRow = pikkuScenarioStep<
  { containing: string; andContaining?: string },
  { found: true },
  true
>({
  name: 'seesTableRow',
  description: 'sees a table row holding the given text',
  template: 'sees the {containing} row',
  browser: true,
  func: async (_services, { containing, andContaining }, { browser }) => {
    const row = browser.page
      .locator('table tbody tr')
      .filter({ hasText: containing })
      .first()
    await row.waitFor({ state: 'visible', timeout: TIMEOUT })
    if (andContaining !== undefined) {
      const text = (await row.textContent()) ?? ''
      if (!text.includes(andContaining)) {
        throw new Error(
          `Expected the ${containing} row to hold "${andContaining}", got: ${text}`
        )
      }
    }
    return { found: true }
  },
})

export const doesNotSeeTableRow = pikkuScenarioStep<
  { containing: string },
  { absent: true },
  true
>({
  name: 'doesNotSeeTableRow',
  description: 'expects no table row to hold the given text',
  template: 'sees no {containing} row',
  browser: true,
  func: async (_services, { containing }, { browser }) => {
    await browser.page
      .locator('table tbody tr')
      .first()
      .waitFor({ state: 'visible', timeout: TIMEOUT })
    const rows = browser.page
      .locator('table tbody tr')
      .filter({ hasText: containing })
    const found = await rows.count()
    if (found > 0) {
      throw new Error(`Expected no ${containing} row, found ${found}`)
    }
    return { absent: true }
  },
})

/**
 * Reads the personas a scenario shows it is cast with.
 *
 * The cast renders as avatars with no accessible name, so each member carries
 * the persona key as a data attribute — reading that is what keeps this
 * assertion about who is in the cast rather than about how an avatar happens to
 * look.
 */
export const readsFlowCast = pikkuScenarioStep<
  { flow: string },
  { cast: string[] },
  true
>({
  name: 'readsFlowCast',
  description: 'reads the personas cast in a scenario',
  template: 'reads the cast of {flow}',
  browser: true,
  func: async (_services, { flow }, { browser }) => {
    const card = browser.page.locator(
      `[data-testid="scenario-section-${flow}"]`
    )
    await card.first().waitFor({ state: 'visible', timeout: TIMEOUT })
    return {
      cast: await card
        .first()
        .locator('[data-testid="scenario-cast-member"]')
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('data-persona-key') ?? '')
        ),
    }
  },
})

export const expectsFlowCast = pikkuScenarioStep<
  { read: { cast: string[] }; personas: string[] },
  { cast: number }
>({
  name: 'expectsFlowCast',
  description: 'expects a scenario to be cast with the given personas',
  template: 'expects the cast to be {personas}',
  func: async (_services, { read, personas }) => {
    for (const persona of personas) {
      if (!read.cast.includes(persona)) {
        throw new Error(
          `Expected ${persona} in the cast, got ${read.cast.join(', ') || 'nobody'}`
        )
      }
    }
    return { cast: read.cast.length }
  },
})

export const fillsField = pikkuScenarioStep<
  { label: string; value: string },
  { filled: string },
  true
>({
  name: 'fillsField',
  description: 'fills a form field by its label',
  template: 'fills {label}',
  browser: true,
  func: async (_services, { label, value }, { browser }) => {
    await browser.page
      .getByLabel(label)
      .first()
      .fill(value, { timeout: TIMEOUT })
    return { filled: label }
  },
})

export const fillsTestId = pikkuScenarioStep<
  { testId: string; value: string },
  { filled: string },
  true
>({
  name: 'fillsTestId',
  description: 'fills a form field by its test id',
  template: 'fills {testId}',
  browser: true,
  func: async (_services, { testId, value }, { browser }) => {
    await browser
      .locate({ testId })
      .first()
      .fill(value, { timeout: TIMEOUT })
    return { filled: testId }
  },
})

/**
 * Asserts what a control is currently offering: whether it is enabled, and
 * whether it is ticked. Both are read from the element rather than from a
 * mirrored `data-` attribute, so a control cannot claim a state it does not
 * actually have — and both go through Playwright's retrying matchers, because
 * a control whose state is server-owned only settles once the mutation behind
 * it has round-tripped.
 */
export const expectsControl = pikkuScenarioStep<
  {
    testId: string
    where?: Record<string, string>
    within?: TestIdSelector
    enabled?: boolean
    checked?: boolean
  },
  { enabled: boolean; checked: boolean },
  true
>({
  name: 'expectsControl',
  description: 'expects a control to be in a given enabled/checked state',
  template: 'expects {testId} to be in the expected state',
  browser: true,
  func: async (
    _services,
    { testId, where, within, enabled, checked },
    { browser }
  ) => {
    const target = browser.locate({ testId, where, within }).first()
    if (enabled === true) {
      await expect(target).toBeEnabled({ timeout: TIMEOUT })
    }
    if (enabled === false) {
      await expect(target).toBeDisabled({ timeout: TIMEOUT })
    }
    if (checked === true) {
      await expect(target).toBeChecked({ timeout: TIMEOUT })
    }
    if (checked === false) {
      await expect(target).not.toBeChecked({ timeout: TIMEOUT })
    }
    return {
      enabled: await target.isEnabled(),
      // `isChecked` throws on anything that is not a checkbox or radio, so it
      // is only asked when the caller actually asserted on it.
      checked: checked === undefined ? false : await target.isChecked(),
    }
  },
})

/**
 * Picks an option on a Mantine `Select`.
 *
 * The control renders a readonly `<input role="combobox">` that opens a portalled
 * listbox, so the option is looked up on the page rather than inside the select.
 * `exact` matters whenever one option's value is a prefix of another's.
 */
export const selectsOption = pikkuScenarioStep<
  { testId: string; value: string },
  { selected: string },
  true
>({
  name: 'selectsOption',
  description: 'picks an option on a select',
  template: 'picks {value}',
  browser: true,
  func: async (_services, { testId, value }, { browser }) => {
    await browser.locate({ testId }).first().click({ timeout: TIMEOUT })
    await browser.page
      .getByRole('option', { name: value, exact: true })
      .first()
      .click({ timeout: TIMEOUT })
    return { selected: value }
  },
})

export const expectsUrl = pikkuScenarioStep<
  { contains: string },
  { url: string },
  true
>({
  name: 'expectsUrl',
  description: 'expects the browser to be on a given page',
  template: 'expects the url to contain {contains}',
  browser: true,
  func: async (_services, { contains }, { browser }) => {
    await browser.page.waitForURL((url) => url.href.includes(contains), {
      timeout: TIMEOUT,
    })
    return { url: browser.page.url() }
  },
})

/**
 * Opens a row from the keyboard, which is the only way to prove the row is a
 * real control rather than a mouse-only click target: a `<div onClick>` can be
 * focused by script but will not act on Enter.
 */
export const opensTestIdWithKeyboard = pikkuScenarioStep<
  { testId: string; where?: Record<string, string> },
  { opened: string },
  true
>({
  name: 'opensTestIdWithKeyboard',
  description: 'focuses an element and opens it with the keyboard',
  template: 'opens {testId} with the keyboard',
  browser: true,
  func: async (_services, { testId, where }, { browser }) => {
    const target = browser.locate({ testId, where }).first()
    await target.waitFor({ state: 'visible', timeout: TIMEOUT })
    await target.focus()
    await target.press('Enter')
    return { opened: testId }
  },
})

export const expectsTestIdValue = pikkuScenarioStep<
  { testId: string; value: string },
  { value: string },
  true
>({
  name: 'expectsTestIdValue',
  description: 'expects a form field to hold a given value',
  template: 'expects {testId} to hold {value}',
  browser: true,
  func: async (_services, { testId, value }, { browser }) => {
    const target = browser.locate({ testId }).first()
    await target.waitFor({ state: 'visible', timeout: TIMEOUT })
    const actual = await target.inputValue()
    if (actual !== value) {
      throw new Error(`Expected ${testId} to hold "${value}", got "${actual}"`)
    }
    return { value: actual }
  },
})

/**
 * Navigates through the sidebar rather than by URL.
 *
 * A URL navigation is a full page load, which throws away everything the SPA
 * holds in memory — impersonation among it. Anything asserting on state that
 * survives *within* a session has to move the way a user does, through the
 * router.
 *
 * The rail is an accordion with one section open at a time, so a link may need
 * its section revealed first. Both are addressed by keys declared in code — the
 * route the link points at, and the section's `id` — never by their labels,
 * which are translated.
 */
export const navigatesInConsole = pikkuScenarioStep<
  { href: string; section?: string },
  { href: string },
  true
>({
  name: 'navigatesInConsole',
  description: 'navigates through the console sidebar without reloading',
  template: 'navigates to {href}',
  browser: true,
  func: async (_services, { href, section }, { browser }) => {
    const link = browser.locate(
      { testId: 'nav-link', where: { 'data-href': href } },
      { visible: false }
    )
    if (section && !(await link.isVisible().catch(() => false))) {
      await browser
        .locate(
          { testId: 'nav-section', where: { 'data-section': section } },
          { visible: false }
        )
        .click({ timeout: TIMEOUT })
    }
    await link.click({ timeout: TIMEOUT })
    await browser.page.waitForURL(`**${href}`, { timeout: TIMEOUT })
    return { href }
  },
})
