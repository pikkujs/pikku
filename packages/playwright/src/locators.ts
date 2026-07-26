import type { Locator, Page } from '@playwright/test'
import { registered, type ElementMap } from './elements.js'

/**
 * Mantine-aware element resolution and drivers. Each interaction step maps to
 * a Mantine component family; the one correct way to drive that family lives
 * here — written once, instead of rediscovered per app.
 *
 * Every name resolves the same way: the registered element map (generated
 * `name → selector` upfront) → data-testid → role/label → placeholder →
 * visible text — so features stay in plain UI language, registered names are
 * exact, and unregistered UI still resolves heuristically.
 */

const looksLikeCss = (s: string) =>
  /[\[#.>:\s]/.test(s) || s.startsWith('input')
export const escapeRegex = (s: string) =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Resolve a form field (TextInput/Textarea/NumberInput/Select input/…).
 * Mantine parks data-testid on the wrapper div, so descend to the inner
 * control when present.
 */
export async function field(
  page: Page,
  name: string,
  elements?: ElementMap
): Promise<Locator> {
  const explicit = registered(elements, ['fields', 'tables'], name)
  if (explicit) {
    const target = page.locator(explicit).first()
    const inner = target.locator('input, textarea, select').first()
    if (await inner.count()) return inner
    return target
  }
  if (looksLikeCss(name)) return page.locator(name).first()
  // Wait for the testid to attach — the page often paints before React Query
  // resolves, so a synchronous count() check fires too early.
  const byId = page.locator(`[data-testid="${name}"]`).first()
  try {
    await byId.waitFor({ state: 'attached', timeout: 5000 })
    const inner = byId.locator('input, textarea, select').first()
    if (await inner.count()) return inner
    return byId
  } catch {
    // Fall through to label / placeholder.
  }
  const byLabel = page.getByLabel(name, { exact: false })
  if (await byLabel.count()) return byLabel.first()
  return page.getByPlaceholder(name, { exact: false }).first()
}

export async function isVisibleWithin(
  target: Locator,
  timeout = 5000
): Promise<boolean> {
  try {
    await target.waitFor({ state: 'visible', timeout })
    return true
  } catch {
    return false
  }
}

async function activate(target: Locator, timeout = 5000) {
  try {
    await target.click({ timeout })
  } catch {
    await target.evaluate((node) => {
      ;(node as HTMLElement).click()
    })
  }
}

async function settleAfterClick(page: Page, previousUrl?: string) {
  if (previousUrl) {
    await page
      .waitForURL((url) => url.toString() !== previousUrl, { timeout: 3000 })
      .catch(() => {
        // No navigation happened — an in-place action; nothing to wait for.
      })
  }
  await page.waitForLoadState('networkidle', { timeout: 1000 }).catch(() => {
    // Streaming/persistent connections never go idle; the fixed settle below covers it.
  })
  await page.waitForTimeout(400)
}

/**
 * Resolve something clickable (Button/ActionIcon/Anchor/NavLink/Menu.Item):
 * data-testid → interactive roles → visible text.
 */
export async function clickable(
  page: Page,
  label: string,
  elements?: ElementMap
): Promise<Locator | null> {
  const explicit = registered(
    elements,
    ['buttons', 'links', 'tabs', 'menus'],
    label
  )
  if (explicit) {
    const target = page.locator(explicit).first()
    if (await isVisibleWithin(target, 3000)) return target
    return null
  }
  const byId = page.getByTestId(label).first()
  if (await isVisibleWithin(byId, 2000)) return byId
  const fuzzyName = new RegExp(escapeRegex(label), 'i')
  for (const role of ['button', 'tab', 'link', 'menuitem'] as const) {
    const candidate = page.getByRole(role, { name: fuzzyName }).first()
    if (await isVisibleWithin(candidate, 1500)) return candidate
  }
  const byText = page.getByText(label, { exact: false }).first()
  if (await isVisibleWithin(byText, 1500)) return byText
  return null
}

export async function click(page: Page, label: string, elements?: ElementMap) {
  const target = await clickable(page, label, elements)
  if (!target) throw new Error(`Could not click "${label}"`)
  const previousUrl = page.url()
  await activate(target)
  await settleAfterClick(page, previousUrl)
}

/** Tabs.Tab — registered selector, else role=tab by visible label. */
export async function switchTab(
  page: Page,
  label: string,
  elements?: ElementMap
) {
  const explicit = registered(elements, ['tabs'], label)
  const tab = explicit
    ? page.locator(explicit).first()
    : page
        .getByRole('tab', { name: new RegExp(escapeRegex(label), 'i') })
        .first()
  if (!(await isVisibleWithin(tab)))
    throw new Error(`Could not find tab "${label}"`)
  await activate(tab)
  await page.waitForTimeout(250)
}

/**
 * Select/MultiSelect/Autocomplete/TagsInput (combobox popover pattern) and
 * NativeSelect (<select>): open, then pick the option by visible label.
 */
export async function selectOption(
  page: Page,
  value: string,
  name: string,
  elements?: ElementMap
) {
  const target = await field(page, name, elements)
  const tag = await target
    .evaluate((el) => (el as HTMLElement).tagName.toLowerCase())
    .catch(() => '')
  if (tag === 'select') {
    await target.selectOption({ label: value })
    return
  }
  await target.click()
  await page.getByRole('option', { name: value, exact: false }).first().click()
  // Close a still-open multi-select popover so it doesn't shadow later clicks.
  await page.keyboard.press('Escape').catch(() => {
    // Popover already closed itself on selection.
  })
}

/** Radio.Group / SegmentedControl — role=radio by visible label. */
export async function choose(
  page: Page,
  value: string,
  groupName: string,
  elements?: ElementMap
) {
  const group = await field(page, groupName, elements)
  const radio = group
    .getByRole('radio', { name: new RegExp(escapeRegex(value), 'i') })
    .first()
  if (await radio.count()) {
    await radio.check({ force: true })
    return
  }
  // SegmentedControl renders labels over hidden inputs — click the label.
  const label = group.getByText(value, { exact: false }).first()
  if (!(await isVisibleWithin(label))) {
    throw new Error(`Could not choose "${value}" in "${groupName}"`)
  }
  await label.click()
}

/**
 * Checkbox/Switch/Chip — set an explicit state (idempotent; a bare toggle
 * makes scenarios depend on prior state, which is what makes them flaky).
 * Mantine visually hides the input, so state is read from the input but the
 * click lands on the wrapper.
 */
export async function setChecked(
  page: Page,
  name: string,
  on: boolean,
  elements?: ElementMap
) {
  const target = await field(page, name, elements)
  const current = await target.isChecked().catch(() => null)
  if (current === on) return
  try {
    await target.setChecked(on, { force: true })
  } catch {
    // Input fully hidden — click the closest Mantine wrapper/label instead.
    await target.evaluate((el) => {
      const wrapper = (el as HTMLElement).closest(
        'label, [class*="Switch"], [class*="Checkbox"], [class*="Chip"]'
      )
      ;((wrapper ?? el) as HTMLElement).click()
    })
  }
}

/**
 * DateInput (typeable) and DatePickerInput/DateTimePicker (popover) — try
 * typing first, fall back to picking the day in the opened calendar.
 */
export async function pickDate(
  page: Page,
  value: string,
  name: string,
  elements?: ElementMap
) {
  const target = await field(page, name, elements)
  const editable = await target.isEditable().catch(() => false)
  if (editable) {
    await target.fill('')
    await target.fill(value)
    await page.keyboard.press('Escape').catch(() => {
      // No popover was open.
    })
    return
  }
  // Button-style picker: open the popover and click the day (aria-label is the
  // full date on Mantine day cells).
  await target.click()
  const day = page
    .locator(`[aria-label*="${value}"], [data-date="${value}"]`)
    .first()
  if (!(await isVisibleWithin(day, 3000))) {
    throw new Error(
      `Could not pick date "${value}" in "${name}" — not typeable and no matching day cell`
    )
  }
  await day.click()
}

/** FileInput/Dropzone — set files on the (hidden) file input. */
export async function upload(
  page: Page,
  filePath: string,
  name: string,
  elements?: ElementMap
) {
  const target = await field(page, name, elements)
  const isFileInput = await target
    .evaluate((el) => el instanceof HTMLInputElement && el.type === 'file')
    .catch(() => false)
  if (isFileInput) {
    await target.setInputFiles(filePath)
    return
  }
  // FileInput/Dropzone render a button/zone; the real input is hidden nearby.
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 5000 }),
    target.click(),
  ])
  await chooser.setFiles(filePath)
}

/** A table row identified by its visible text. */
export function row(page: Page, rowText: string): Locator {
  return page.getByRole('row', { name: new RegExp(escapeRegex(rowText)) })
}

export async function clickInRow(page: Page, rowText: string, label: string) {
  const scope = row(page, rowText)
  const previousUrl = page.url()
  for (const role of ['button', 'link', 'menuitem'] as const) {
    const candidate = scope
      .getByRole(role, { name: new RegExp(label, 'i') })
      .first()
    if (await isVisibleWithin(candidate)) {
      await activate(candidate)
      await settleAfterClick(page, previousUrl)
      return
    }
  }
  const byText = scope.getByText(label, { exact: false }).first()
  if (await isVisibleWithin(byText)) {
    await activate(byText)
    await settleAfterClick(page, previousUrl)
    return
  }
  throw new Error(`Could not click "${label}" inside row "${rowText}"`)
}

/** Kebab/Menu pattern: open the row's menu trigger, then click the item. */
export async function chooseFromRowMenu(
  page: Page,
  rowText: string,
  item: string
) {
  const scope = row(page, rowText)
  const trigger = scope
    .locator('[aria-haspopup="menu"], [data-testid*="menu"], button:has(svg)')
    .last()
  if (!(await isVisibleWithin(trigger))) {
    throw new Error(`Could not find a menu in row "${rowText}"`)
  }
  await trigger.click()
  const menuItem = page
    .getByRole('menuitem', { name: new RegExp(escapeRegex(item), 'i') })
    .first()
  if (!(await isVisibleWithin(menuItem, 3000))) {
    throw new Error(`Could not find "${item}" in the menu on row "${rowText}"`)
  }
  await menuItem.click()
  await settleAfterClick(page)
}

/**
 * Confirm/dismiss the open Modal/Drawer/popconfirm — and native window.confirm
 * as a fallback (accepted/dismissed via a one-shot dialog handler).
 */
export async function resolveDialog(page: Page, accept: boolean) {
  page.once('dialog', (d) => void (accept ? d.accept() : d.dismiss()))
  const dialog = page.locator('[role="dialog"], [role="alertdialog"]').last()
  if (await isVisibleWithin(dialog, 2000)) {
    const pattern = accept
      ? /confirm|bestätigen|yes|ok|delete|löschen|save|speichern|continue|weiter/i
      : /cancel|abbrechen|no|nein|close|schließen/i
    const button = dialog.getByRole('button', { name: pattern }).first()
    if (await isVisibleWithin(button, 2000)) {
      await button.click()
      await settleAfterClick(page)
      return
    }
    if (!accept) {
      await page.keyboard.press('Escape')
      return
    }
    throw new Error(
      'A dialog is open but no confirm-style button was found in it'
    )
  }
  // No Mantine dialog — assume the click that follows triggers window.confirm,
  // which the one-shot handler above resolves.
}

/** @mantine/notifications toast (falls back to role=alert). */
export async function expectNotification(
  page: Page,
  text: string,
  timeout = 10_000
) {
  const toast = page
    .locator('[class*="Notification"], [role="alert"], [role="status"]')
    .filter({ hasText: text })
    .first()
  if (!(await isVisibleWithin(toast, timeout))) {
    throw new Error(`No notification containing "${text}" appeared`)
  }
}
