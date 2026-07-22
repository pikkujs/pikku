import { resolve } from 'node:path'
import type { BrowserWorld } from './world.js'
import type { ActorSession } from './actor-session.js'
import * as ui from './locators.js'
import { sweepAllPages } from './pages-sweep.js'

/**
 * The browser step vocabulary. Third-person actor grammar, always:
 *
 *   Given "the admin" is signed in        ← actor = persona, own window/session
 *   When they click "New booking"         ← `they` = last-referenced actor
 *   Then "a member" sees "New booking"    ← second actor, second window
 *
 * `{actor}` is a Cucumber parameter type whose transformer resolves straight
 * to the ActorSession (cucumber binds transformers to the World and supports
 * async): a quoted persona name creates/reuses that actor, `they` is the
 * last-referenced actor (before any named actor: the default actor, "the
 * user"). Verbs use Cucumber-expression optionals and alternation —
 * `click(s)`, `is/are` — never regex.
 *
 * Steps map to Mantine component families (select → Select/Autocomplete,
 * turn on/off → Switch/Checkbox/Chip, pick date → DateInput, …); the one
 * correct way to drive each family lives in locators.ts, resolving names via
 * the registered element map first, Mantine heuristics second.
 */

type TableLike = { rowsHash: () => Record<string, string> }
type ListTableLike = { raw: () => string[][] }

export interface BrowserStepApi {
  Given: (
    pattern: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fn: (this: BrowserWorld, ...args: any[]) => void | Promise<void>
  ) => void
  When: (
    pattern: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fn: (this: BrowserWorld, ...args: any[]) => void | Promise<void>
  ) => void
  Then: (
    pattern: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fn: (this: BrowserWorld, ...args: any[]) => void | Promise<void>
  ) => void
  defineParameterType: (opts: {
    name: string
    regexp: RegExp
    transformer: (this: BrowserWorld, value: string) => unknown
    useForSnippets?: boolean
  }) => void
}

async function poll(
  timeoutMs: number,
  check: () => Promise<boolean>,
  message: () => string
) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(message())
}

export function registerBrowserSteps({
  Given,
  When,
  Then,
  defineParameterType,
}: BrowserStepApi) {
  // `"name"` creates/reuses that actor; they/They → the last-referenced one.
  // Resolves to the ActorSession itself — steps receive the actor, not a name.
  defineParameterType({
    name: 'actor',
    regexp: /"[^"]*"|they|They/,
    transformer: async function (value) {
      return this.actor(value.startsWith('"') ? value.slice(1, -1) : undefined)
    },
    useForSnippets: false,
  })

  // ── Session ──────────────────────────────────────────────────────────────
  Given('{actor} is/are signed in', async function (actor: ActorSession) {
    await actor.signIn()
    await actor.gotoApp('/')
  })

  Given('{actor} is/are not signed in', async function (actor: ActorSession) {
    await actor.gotoApp('/')
  })

  // The actor's persona (config.personas[name]) carries the credentials —
  // features never repeat them. The explicit as/with-password form exists
  // only for testing INVALID credentials.
  Given('{actor} is/are logged in', async function (actor: ActorSession) {
    await actor.loginViaForm()
  })

  When('{actor} log(s) in', async function (actor: ActorSession) {
    await actor.loginViaForm()
  })

  Given(
    '{actor} is/are logged in as {string} with password {string}',
    async function (actor: ActorSession, email: string, password: string) {
      await actor.loginViaForm({ email, password })
    }
  )

  When(
    '{actor} log(s) in as {string} with password {string}',
    async function (actor: ActorSession, email: string, password: string) {
      await actor.loginViaForm({ email, password })
    }
  )

  When('{actor} log(s) out', async function (actor: ActorSession) {
    await actor.logout()
  })

  Given('a test account exists', async function () {
    const actor = await this.actor('the user')
    await actor.ensureAccount()
  })

  When(
    '{actor} sign(s) in through the login form',
    async function (actor: ActorSession) {
      await actor.loginViaForm()
    }
  )

  Then('{actor} land(s) on the app', async function (actor: ActorSession) {
    await actor.page.waitForURL((u) => !u.pathname.startsWith('/login'))
  })

  // ── Navigation ───────────────────────────────────────────────────────────
  When(
    '{actor} visit(s) {string}',
    async function (actor: ActorSession, path: string) {
      await actor.gotoApp(path)
    }
  )

  Then('the URL contains {string}', async function (fragment: string) {
    const actor = await this.actor(undefined)
    await actor.page.waitForURL((url) => url.toString().includes(fragment))
  })

  Then('the URL does not contain {string}', async function (fragment: string) {
    const actor = await this.actor(undefined)
    await actor.page.waitForURL((url) => !url.toString().includes(fragment))
  })

  // ── Forms ────────────────────────────────────────────────────────────────
  When(
    '{actor} fill(s) {string} with {string}',
    async function (actor: ActorSession, fieldName: string, value: string) {
      const target = await ui.field(actor.page, fieldName, this.config.elements)
      await target.fill('')
      await target.fill(value)
    }
  )

  When(
    '{actor} fill(s) in:',
    async function (actor: ActorSession, table: TableLike) {
      for (const [fieldName, value] of Object.entries(table.rowsHash())) {
        const target = await ui.field(
          actor.page,
          fieldName,
          this.config.elements
        )
        await target.fill('')
        await target.fill(value)
      }
    }
  )

  When(
    '{actor} turn(s) on {string}',
    async function (actor: ActorSession, fieldName: string) {
      await ui.setChecked(actor.page, fieldName, true, this.config.elements)
    }
  )

  When(
    '{actor} turn(s) off {string}',
    async function (actor: ActorSession, fieldName: string) {
      await ui.setChecked(actor.page, fieldName, false, this.config.elements)
    }
  )

  When(
    '{actor} select(s) {string} from {string}',
    async function (actor: ActorSession, value: string, fieldName: string) {
      await ui.selectOption(actor.page, value, fieldName, this.config.elements)
    }
  )

  When(
    '{actor} choose(s) {string} in {string}',
    async function (actor: ActorSession, value: string, groupName: string) {
      await ui.choose(actor.page, value, groupName, this.config.elements)
    }
  )

  When(
    '{actor} pick(s) date {string} in {string}',
    async function (actor: ActorSession, value: string, fieldName: string) {
      await ui.pickDate(actor.page, value, fieldName, this.config.elements)
    }
  )

  When(
    '{actor} upload(s) {string} to {string}',
    async function (actor: ActorSession, file: string, fieldName: string) {
      await ui.upload(
        actor.page,
        resolve(this.config.fixturesDir, file),
        fieldName,
        this.config.elements
      )
    }
  )

  When(
    '{actor} press(es) {string}',
    async function (actor: ActorSession, key: string) {
      await actor.page.keyboard.press(key)
    }
  )

  Then(
    'the field {string} has value {string}',
    async function (fieldName: string, value: string) {
      const actor = await this.actor(undefined)
      const target = await ui.field(actor.page, fieldName, this.config.elements)
      await poll(
        this.config.timeout,
        async () => (await target.inputValue().catch(() => null)) === value,
        () => `Field "${fieldName}" does not have value "${value}"`
      )
    }
  )

  // ── Actions ──────────────────────────────────────────────────────────────
  When(
    '{actor} click(s) {string}',
    async function (actor: ActorSession, label: string) {
      await ui.click(actor.page, label, this.config.elements)
    }
  )

  When(
    '{actor} switch(es) to the {string} tab',
    async function (actor: ActorSession, label: string) {
      await ui.switchTab(actor.page, label, this.config.elements)
    }
  )

  When(
    'in row {string} {actor} click(s) {string}',
    async function (rowText: string, actor: ActorSession, label: string) {
      await ui.clickInRow(actor.page, rowText, label)
    }
  )

  When(
    'in row {string} {actor} choose(s) {string} from the menu',
    async function (rowText: string, actor: ActorSession, item: string) {
      await ui.chooseFromRowMenu(actor.page, rowText, item)
    }
  )

  When('{actor} confirm(s)', async function (actor: ActorSession) {
    await ui.resolveDialog(actor.page, true)
  })

  When('{actor} dismiss(es)', async function (actor: ActorSession) {
    await ui.resolveDialog(actor.page, false)
  })

  // Native-dialog helpers (window.confirm / window.prompt widgets).
  When(
    '{actor} accept(s) the next confirmation',
    async function (actor: ActorSession) {
      actor.page.once('dialog', (d) => void d.accept())
    }
  )

  When(
    '{actor} answer(s) the next prompt with {string}',
    async function (actor: ActorSession, value: string) {
      await actor.page.evaluate((v) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).prompt = () => v
      }, value)
    }
  )

  // ── Assertions ───────────────────────────────────────────────────────────
  Then(
    '{actor} see(s) {string}',
    async function (actor: ActorSession, text: string) {
      await actor.expectText(text)
    }
  )

  Then(
    '{actor} do/does not see {string}',
    async function (actor: ActorSession, text: string) {
      await expectHidden(actor, text, this.config.timeout)
    }
  )

  Then(
    '{actor} see(s) all of:',
    async function (actor: ActorSession, table: ListTableLike) {
      for (const [text] of table.raw()) {
        if (text) await actor.expectText(text)
      }
    }
  )

  Then(
    '{actor} wait(s) until they see {string}',
    async function (actor: ActorSession, text: string) {
      await actor.expectText(text, Math.max(this.config.timeout, 60_000))
    }
  )

  Then(
    '{actor} see(s) a notification {string}',
    async function (actor: ActorSession, text: string) {
      await ui.expectNotification(actor.page, text)
    }
  )

  Then(
    'in row {string} {actor} see(s) {string}',
    async function (rowText: string, actor: ActorSession, text: string) {
      const target = ui
        .row(actor.page, rowText)
        .getByText(text, { exact: false })
        .first()
      await poll(
        this.config.timeout,
        () => target.isVisible().catch(() => false),
        () => `Did not find "${text}" in row "${rowText}"`
      )
    }
  )

  Then(
    'in row {string} {actor} do/does not see {string}',
    async function (rowText: string, actor: ActorSession, text: string) {
      const target = ui
        .row(actor.page, rowText)
        .getByText(text, { exact: false })
        .first()
      await poll(
        5_000,
        async () => !(await target.isVisible().catch(() => false)),
        () => `Expected "${text}" to be hidden in row "${rowText}"`
      )
    }
  )

  Then(
    'the {string} table has {int} row(s)',
    async function (tableName: string, want: number) {
      const actor = await this.actor(undefined)
      const table = await ui.field(actor.page, tableName, this.config.elements)
      let got = -1
      await poll(
        this.config.timeout,
        async () => {
          // Header row excluded via tbody when present.
          const body = table.locator('tbody tr')
          got =
            (await body.count()) || (await table.getByRole('row').count()) - 1
          return got === want
        },
        () => `The "${tableName}" table has ${got} row(s), expected ${want}`
      )
    }
  )

  // ── Backend bridge ───────────────────────────────────────────────────────
  When('the app data is reset', async function () {
    await this.resetAppData()
  })

  // ── Smoke sweep ──────────────────────────────────────────────────────────
  Then('every page loads without errors', async function () {
    const actor = await this.actor(undefined)
    await sweepAllPages(actor, this.config.repoRoot)
  })
}

async function expectHidden(
  actor: ActorSession,
  text: string,
  graceMs: number
) {
  // Give a just-clicked action a beat to render, then require hidden.
  await actor.page.waitForTimeout(Math.min(500, graceMs))
  const visible = await actor.page
    .getByText(text, { exact: false })
    .first()
    .isVisible()
    .catch(() => false)
  if (visible)
    throw new Error(`Expected "${text}" to be hidden (${actor.name})`)
}
