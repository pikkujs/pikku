/**
 * Impersonating another user from the console.
 *
 * The feature under test is a *header*: impersonation must ride on execution
 * requests (starting a workflow run, calling an agent) and must never ride on
 * the console's own chrome requests. So the assertions here are made over the
 * requests a step caused, and every step that needs them records its own.
 *
 * Recording is scoped to the action rather than held open across steps on
 * purpose. A recorder that spans steps is shared mutable state between them —
 * the exact hazard this migration exists to remove — and it also makes the
 * assertion vague: "no request carried the header" is a much weaker claim than
 * "no request *this action caused* carried the header".
 *
 * The listener is Playwright's own `page.on('request')`, which sees every
 * outgoing request. Patching `window.fetch` from an init script would be
 * blind to anything the page sends by another route, and a negative assertion
 * that cannot see a request passes for the wrong reason.
 */
import { pikkuScenarioStep } from '#pikku/workflow/pikku-workflow-types.gen.js'
import type { PikkuBrowserWire } from '@pikku/core/workflow'
import { expect } from '@pikku/playwright'

const TIMEOUT = 15_000

const IMPERSONATE_HEADER = 'x-pikku-impersonate-user-id'

interface RecordedRequest {
  url: string
  impersonate: string | null
}

/**
 * Runs an action with a request listener attached, and returns everything the
 * action sent. The listener is always detached, so a failing action cannot
 * leave the page recording into an array nobody reads.
 */
const recording = async <T>(
  browser: PikkuBrowserWire,
  action: () => Promise<T>
): Promise<RecordedRequest[]> => {
  const requests: RecordedRequest[] = []
  const listener = (request: {
    url(): string
    headers(): Record<string, string>
  }) => {
    requests.push({
      url: request.url(),
      impersonate: request.headers()[IMPERSONATE_HEADER] ?? null,
    })
  }
  browser.page.on('request', listener)
  try {
    await action()
  } finally {
    browser.page.off('request', listener)
  }
  return requests
}

export const impersonatesUser = pikkuScenarioStep<
  { email: string },
  { impersonating: string },
  true
>({
  name: 'impersonatesUser',
  description: 'starts impersonating a user from the console sidebar',
  template: 'impersonates {email}',
  browser: true,
  func: async (_services, { email }, { browser }) => {
    await browser.page
      .locator('[data-testid="impersonate-open"]')
      .click({ timeout: TIMEOUT })
    await browser.page
      .locator('[data-testid="impersonate-search"]')
      .fill(email, { timeout: TIMEOUT })
    await browser.page
      .locator('[data-testid="impersonate-user"]')
      .filter({ hasText: email })
      .click({ timeout: TIMEOUT })
    return { impersonating: email }
  },
})

export const stopsImpersonating = pikkuScenarioStep<
  void,
  { stopped: true },
  true
>({
  name: 'stopsImpersonating',
  description: 'ends the impersonation session from the banner',
  template: 'stops impersonating',
  browser: true,
  func: async (_services, _data, { browser }) => {
    await browser.page
      .locator('[data-testid="impersonation-stop"]')
      .click({ timeout: TIMEOUT })
    return { stopped: true }
  },
})

/**
 * Searching the users directory is the console reading its own data — the
 * canonical chrome request, and the one that must stay unimpersonated.
 *
 * The search is debounced and the unfiltered listing already contains every
 * fixture user, so waiting for the matching row to *appear* would return
 * before the request was ever sent. The step waits for the listing to narrow
 * to that one row instead, which only the completed search can produce.
 */
export const searchesUsers = pikkuScenarioStep<
  { query: string },
  { requests: RecordedRequest[] },
  true
>({
  name: 'searchesUsers',
  description: 'searches the console users directory',
  template: 'searches the users list for {query}',
  browser: true,
  func: async (_services, { query }, { browser }) => {
    const requests = await recording(browser, async () => {
      await browser.page
        .locator('[data-testid="page-search"]:visible')
        .fill(query, { timeout: TIMEOUT })
      await expect(
        browser.page.locator('[data-testid="user-row"]')
      ).toHaveCount(1, { timeout: TIMEOUT })
      await expect(
        browser.page.locator('[data-testid="user-row"]').filter({
          hasText: query,
        })
      ).toBeVisible({ timeout: TIMEOUT })
    })
    return { requests }
  },
})

/**
 * Starting a run from the console, as a user would: open the new-run form on
 * the workflow already on screen, fill its declared inputs and submit. The form
 * is RJSF, so each field is addressed by the schema property it is bound to
 * (`#root_<key>`) rather than by its rendered label, which is translated.
 *
 * The workflow has to already be open, because impersonation lives in React
 * state and a full page load ends it — which is why the scenario navigates
 * here through the sidebar rather than by URL.
 */
export const startsWorkflowRunFromConsole = pikkuScenarioStep<
  { input: Record<string, string> },
  { requests: RecordedRequest[] },
  true
>({
  name: 'startsWorkflowRunFromConsole',
  description: 'starts a run from the workflow already open in the console',
  template: 'starts a run from the console',
  browser: true,
  func: async (_services, { input }, { browser }) => {
    await browser.page
      .locator('[data-testid="runs-panel-new"]')
      .click({ timeout: TIMEOUT })
    await browser.page
      .locator('[data-testid="schema-form"]')
      .waitFor({ timeout: TIMEOUT })

    for (const [field, value] of Object.entries(input)) {
      await browser.page
        .locator(`#root_${field}`)
        .fill(value, { timeout: TIMEOUT })
    }

    const requests = await recording(browser, async () => {
      await browser.page
        .locator('[data-testid="schema-form-submit"]')
        .click({ timeout: TIMEOUT })
      await expect(
        browser.page.locator('[data-testid="schema-form"]')
      ).toBeHidden({ timeout: TIMEOUT })
    })
    return { requests }
  },
})

/**
 * Asserts over the impersonation header on a recorded set of requests.
 *
 * `urlContains` narrows to the surface being judged, because "carried" and
 * "did not carry" are both claims about a *class* of request: chrome requests
 * must never carry it, execution requests always must.
 */
export const expectsImpersonationHeader = pikkuScenarioStep<
  { requests: RecordedRequest[]; urlContains: string; present: boolean },
  { matched: number }
>({
  name: 'expectsImpersonationHeader',
  description:
    'asserts whether recorded requests carried the impersonation header',
  template: 'expects the impersonation header on {urlContains} to be {present}',
  func: async (_services, { requests, urlContains, present }) => {
    const matching = requests.filter((r) => r.url.includes(urlContains))
    if (matching.length === 0) {
      throw new Error(
        `No recorded request matched "${urlContains}" — recorded: ${JSON.stringify(
          requests.map((r) => r.url)
        )}`
      )
    }
    const carrying = matching.filter((r) => r.impersonate !== null)
    if (present && carrying.length === 0) {
      throw new Error(
        `Expected a request matching "${urlContains}" to carry ${IMPERSONATE_HEADER}, none did: ${JSON.stringify(matching)}`
      )
    }
    if (!present && carrying.length > 0) {
      throw new Error(
        `Expected no request matching "${urlContains}" to carry ${IMPERSONATE_HEADER}: ${JSON.stringify(carrying)}`
      )
    }
    return { matched: matching.length }
  },
})
