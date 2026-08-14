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
import type { PikkuBrowserWire } from '@pikku/core/scenario'
import { expect } from '@pikku/playwright'

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
  { impersonating: string }
>({
  name: 'impersonatesUser',
  description: 'starts impersonating a user from the command palette',
  template: 'impersonates {email}',
  browser: async (_services, { email }, { browser }) => {
    await browser.page.keyboard.press('ControlOrMeta+KeyK')
    const palette = browser.page.getByPlaceholder(
      'Search functions, routes, workflows...'
    )
    await palette.fill('Impersonate')
    await palette.press('Enter')
    await browser.locate({ testId: 'impersonate-search' }).fill(email)
    await browser
      .locate({ testId: 'impersonate-user', containing: email })
      .click()
    return { impersonating: email }
  },
})

export const stopsImpersonating = pikkuScenarioStep<void, { stopped: true }>({
  name: 'stopsImpersonating',
  description: 'ends the impersonation session from the banner',
  template: 'stops impersonating',
  browser: async (_services, _data, { browser }) => {
    await browser.locate({ testId: 'impersonation-stop' }).click()
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
  { requests: RecordedRequest[] }
>({
  name: 'searchesUsers',
  description: 'searches the console users directory',
  template: 'searches the users list for {query}',
  browser: async (_services, { query }, { browser }) => {
    const requests = await recording(browser, async () => {
      await browser.locate({ testId: 'page-search' }).fill(query)
      await expect(browser.locate({ testId: 'user-row' })).toHaveCount(1, {})
      await expect(
        browser.locate({ testId: 'user-row', containing: query })
      ).toBeVisible()
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
  { requests: RecordedRequest[] }
>({
  name: 'startsWorkflowRunFromConsole',
  description: 'starts a run from the workflow already open in the console',
  template: 'starts a run from the console',
  browser: async (_services, { input }, { browser }) => {
    await browser.locate({ testId: 'runs-panel-new' }).click()
    await browser.locate({ testId: 'schema-form' }).waitFor()

    for (const [field, value] of Object.entries(input)) {
      await browser.page.locator(`#root_${field}`).fill(value)
    }

    const requests = await recording(browser, async () => {
      await browser.locate({ testId: 'schema-form-submit' }).click()
      await expect(
        browser.locate({ testId: 'schema-form' }, { visible: false })
      ).toBeHidden()
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
  default: async (_services, { requests, urlContains, present }) => {
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
