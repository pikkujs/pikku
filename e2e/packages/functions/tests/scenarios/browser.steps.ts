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
import { pikkuScenarioStep } from '#pikku/scenarios/pikku-scenario-types.gen.js'
import type { TestIdSelector } from '@pikku/core/scenario'
import { expect } from '@pikku/playwright'

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

export const seesText = pikkuScenarioStep<{ text: string }, { visible: true }>({
  name: 'seesText',
  description: 'sees a piece of text on the page',
  template: 'sees {text}',
  browser: async (_services, { text }, { browser }) => {
    await browser.page
      .getByText(text, { exact: false })
      .first()
      .waitFor({ state: 'visible' })
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
  { absent: true }
>({
  name: 'doesNotSeeText',
  description: 'expects a piece of text to be absent',
  template: 'does not see {text}',
  browser: async (_services, { text }, { browser }) => {
    await browser.page
      .getByText(text, { exact: false })
      .first()
      .waitFor({ state: 'detached' })
    return { absent: true }
  },
})

export const clicksButton = pikkuScenarioStep<
  { name: string },
  { clicked: string }
>({
  name: 'clicksButton',
  description: 'clicks a button by its accessible name',
  template: 'clicks the {name} button',
  browser: async (_services, { name }, { browser }) => {
    await browser.page
      .getByRole('button', { name })
      .filter({ visible: true })
      .first()
      .click()
    return { clicked: name }
  },
})

export const clicksLink = pikkuScenarioStep<
  { name: string },
  { clicked: string }
>({
  name: 'clicksLink',
  description: 'clicks a link by its accessible name',
  template: 'clicks the {name} link',
  browser: async (_services, { name }, { browser }) => {
    await browser.page.getByRole('link', { name }).first().click()
    return { clicked: name }
  },
})

export const clicksTestId = pikkuScenarioStep<
  TestIdSelector,
  { clicked: string }
>({
  name: 'clicksTestId',
  description: 'clicks an element by its test id',
  template: 'clicks {testId}',
  browser: async (_services, selector, { browser }) => {
    await browser.locate(selector).first().click()
    const { testId, containing } = selector
    return { clicked: containing ? `${testId}:${containing}` : testId }
  },
})

export const seesTestId = pikkuScenarioStep<
  TestIdSelector & {
    count?: number
    atLeast?: number
    /** Overrides the default wait, for a state that arrives via a redirect. */
    timeoutMs?: number
  },
  { count: number }
>({
  name: 'seesTestId',
  description: 'sees an element with a given test id',
  template: 'sees {testId}',
  browser: async (
    _services,
    { count, atLeast, timeoutMs, ...selector },
    { browser }
  ) => {
    const target = browser.locate(selector)
    await target.first().waitFor({ state: 'visible', timeout: timeoutMs })
    const found = await target.count()
    if (count !== undefined && found !== count) {
      throw new Error(
        `Expected ${count} ${selector.testId} element(s), got ${found}`
      )
    }
    if (atLeast !== undefined && found < atLeast) {
      throw new Error(
        `Expected at least ${atLeast} ${selector.testId} element(s), got ${found}`
      )
    }
    return { count: found }
  },
})

export const doesNotSeeTestId = pikkuScenarioStep<
  TestIdSelector,
  { absent: true }
>({
  name: 'doesNotSeeTestId',
  description: 'expects an element with a given test id to be absent',
  template: 'does not see {testId}',
  browser: async (_services, selector, { browser }) => {
    await browser
      .locate(selector, { visible: false })
      .first()
      .waitFor({ state: 'detached' })
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
  { selected: string }
>({
  name: 'selectsSegment',
  description: 'picks an option on a segmented control',
  template: 'switches to {value}',
  browser: async (_services, { value }, { browser }) => {
    await browser.page
      .locator(`label[for$="-${value}"]:visible`)
      .first()
      .click()
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
  { selected: string }
>({
  name: 'selectsTab',
  description: 'picks a view on the page header switch',
  template: 'switches to the {value} view',
  browser: async (_services, { value }, { browser }) => {
    await browser
      .locate({ testId: 'switch-tab', where: { 'data-value': value } })
      .first()
      .click()
    return { selected: value }
  },
})

export const readsTestIdText = pikkuScenarioStep<
  TestIdSelector,
  { text: string }
>({
  name: 'readsTestIdText',
  description: 'reads the text of an element by its test id',
  template: 'reads {testId}',
  browser: async (_services, selector, { browser }) => {
    const target = browser.locate(selector).first()
    await target.waitFor({ state: 'visible' })
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
  { found: true }
>({
  name: 'seesTableRow',
  description: 'sees a table row holding the given text',
  template: 'sees the {containing} row',
  browser: async (_services, { containing, andContaining }, { browser }) => {
    const row = browser.page
      .locator('table tbody tr')
      .filter({ hasText: containing })
      .first()
    await row.waitFor({ state: 'visible' })
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
  { absent: true }
>({
  name: 'doesNotSeeTableRow',
  description: 'expects no table row to hold the given text',
  template: 'sees no {containing} row',
  browser: async (_services, { containing }, { browser }) => {
    await browser.page
      .locator('table tbody tr')
      .first()
      .waitFor({ state: 'visible' })
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
  { cast: string[] }
>({
  name: 'readsFlowCast',
  description: 'reads the personas cast in a scenario',
  template: 'reads the cast of {flow}',
  browser: async (_services, { flow }, { browser }) => {
    const card = browser.page.locator(
      `[data-testid="scenario-section-${flow}"]`
    )
    await card.first().waitFor({ state: 'visible' })
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
  default: async (_services, { read, personas }) => {
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
  { filled: string }
>({
  name: 'fillsField',
  description: 'fills a form field by its label',
  template: 'fills {label}',
  browser: async (_services, { label, value }, { browser }) => {
    await browser.page.getByLabel(label).first().fill(value)
    return { filled: label }
  },
})

export const fillsTestId = pikkuScenarioStep<
  TestIdSelector & { value: string },
  { filled: string }
>({
  name: 'fillsTestId',
  description: 'fills a form field by its test id',
  template: 'fills {testId}',
  browser: async (_services, { value, ...selector }, { browser }) => {
    await browser.locate(selector).first().fill(value)
    return { filled: selector.testId }
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
  TestIdSelector & { enabled?: boolean; checked?: boolean },
  { enabled: boolean; checked: boolean }
>({
  name: 'expectsControl',
  description: 'expects a control to be in a given enabled/checked state',
  template: 'expects {testId} to be in the expected state',
  browser: async (
    _services,
    { enabled, checked, ...selector },
    { browser }
  ) => {
    const target = browser.locate(selector).first()
    if (enabled === true) {
      await expect(target).toBeEnabled()
    }
    if (enabled === false) {
      await expect(target).toBeDisabled()
    }
    if (checked === true) {
      await expect(target).toBeChecked()
    }
    if (checked === false) {
      await expect(target).not.toBeChecked()
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
  TestIdSelector & { value: string },
  { selected: string }
>({
  name: 'selectsOption',
  description: 'picks an option on a select',
  template: 'picks {value}',
  browser: async (_services, { value, ...selector }, { browser }) => {
    await browser.locate(selector).first().click()
    await browser.page
      .getByRole('option', { name: value, exact: true })
      .first()
      .click()
    return { selected: value }
  },
})

export const expectsUrl = pikkuScenarioStep<
  { contains: string },
  { url: string }
>({
  name: 'expectsUrl',
  description: 'expects the browser to be on a given page',
  template: 'expects the url to contain {contains}',
  browser: async (_services, { contains }, { browser }) => {
    await browser.page.waitForURL((url) => url.href.includes(contains), {})
    return { url: browser.page.url() }
  },
})

/**
 * Opens a row from the keyboard, which is the only way to prove the row is a
 * real control rather than a mouse-only click target: a `<div onClick>` can be
 * focused by script but will not act on Enter.
 */
export const opensTestIdWithKeyboard = pikkuScenarioStep<
  TestIdSelector,
  { opened: string }
>({
  name: 'opensTestIdWithKeyboard',
  description: 'focuses an element and opens it with the keyboard',
  template: 'opens {testId} with the keyboard',
  browser: async (_services, selector, { browser }) => {
    const target = browser.locate(selector).first()
    await target.waitFor({ state: 'visible' })
    await target.focus()
    await target.press('Enter')
    return { opened: selector.testId }
  },
})

export const expectsTestIdValue = pikkuScenarioStep<
  TestIdSelector & { value: string },
  { value: string }
>({
  name: 'expectsTestIdValue',
  description: 'expects a form field to hold a given value',
  template: 'expects {testId} to hold {value}',
  browser: async (_services, { value, ...selector }, { browser }) => {
    const target = browser.locate(selector).first()
    await target.waitFor({ state: 'visible' })
    const actual = await target.inputValue()
    if (actual !== value) {
      throw new Error(
        `Expected ${selector.testId} to hold "${value}", got "${actual}"`
      )
    }
    return { value: actual }
  },
})

/**
 * The read-only counterpart of {@link expectsTestIdValue}.
 *
 * A value a person cannot change does not belong in a form field — a disabled
 * input still reads as "you could type here, but not today" — so anything the
 * app computes is rendered as text and has to be asserted as text.
 */
export const expectsTestIdText = pikkuScenarioStep<
  TestIdSelector & { text: string },
  { text: string }
>({
  name: 'expectsTestIdText',
  description: 'expects an element to read exactly as given',
  template: 'expects {testId} to read {text}',
  browser: async (_services, { text, ...selector }, { browser }) => {
    const target = browser.locate(selector).first()
    await target.waitFor({ state: 'visible' })
    const actual = (await target.innerText()).trim()
    if (actual !== text) {
      throw new Error(
        `Expected ${selector.testId} to read "${text}", got "${actual}"`
      )
    }
    return { text: actual }
  },
})

/**
 * Navigates through the command palette rather than by URL.
 *
 * A URL navigation is a full page load, which throws away everything the SPA
 * holds in memory — impersonation among it. Anything asserting on state that
 * survives *within* a session has to move the way a user does, through the
 * router.
 *
 * The palette rather than the chrome, which is a hover-raised dock at pointer
 * widths and a closed sheet on a phone.
 */
export const navigatesInConsole = pikkuScenarioStep<
  { page: string; href: string },
  { href: string }
>({
  name: 'navigatesInConsole',
  description:
    'navigates through the console command palette without reloading',
  template: 'navigates to {page}',
  browser: async (_services, { page, href }, { browser }) => {
    await browser.page.keyboard.press('ControlOrMeta+KeyK')
    const palette = browser.page.getByPlaceholder(
      'Search functions, routes, workflows...'
    )
    await palette.fill(page)
    await palette.press('Enter')
    await browser.page.waitForURL(`**${href}`)
    return { href }
  },
})

/**
 * Photograph the page, so a run can be reviewed rather than only counted.
 *
 * The description is the subject: it becomes the filename, which is how the
 * artifact is found again. Without `--screenshots` the SDK returns the bytes
 * and writes nothing, so this step is a no-op rather than a failure — which is
 * exactly the property `captureScenario` exists to hold onto.
 */
export const capturesTheScreen = pikkuScenarioStep<
  { description: string },
  { captured: true }
>({
  name: 'capturesTheScreen',
  description: 'photographs the page for review',
  template: 'photographs the page as {description}',
  browser: async (_services, { description }, { browser }) => {
    await browser.screenshot(description)
    return { captured: true }
  },
})
