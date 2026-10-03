import { z } from 'zod'
import type { ActorSession } from '@pikku/playwright'

/**
 * Shared plumbing for the generic browser steps. Nothing here is a step — one
 * stepper per file lives in `test/steps/`.
 *
 * The runner opens one BrowserContext per actor and signs it in at `signInPath` BEFORE the
 * first step runs, so there is no "log in" step and no signed-out state to drive. A scenario
 * that must start signed out clears the context itself (`browser.context.clearCookies()`),
 * which only makes sense in one that creates an identity.
 *
 * Do NOT set `XBROWSER_CDP_URL` in a sandbox. `@pikku/playwright` connects over CDP whenever
 * that variable is present and launches the in-image chromium (`PLAYWRIGHT_CHROMIUM_PATH`)
 * otherwise — setting it routes the whole sweep to an off-box browser that cannot reach this
 * app, which reads as every page failing at once.
 */

/** `wire.browser` is the driver's session; the sweep needs its issue collector. */
export const session = (browser: unknown) => browser as ActorSession

/**
 * How a scenario names one control.
 *
 * `testId` is the control's i18n MESSAGE KEY, stamped onto it at build time by the app's
 * `pikku:testids` vite plugin (apps/app/build/inject-testids.ts) — nothing has to be added
 * to a component for this to work. Addressing by key rather than by the text on screen is
 * what makes a scenario survive a reworded button, a redesign, and a locale switch: the
 * text is copy, the key is the control's meaning.
 *
 * Keys are REUSED on purpose — `m.common__save()` is one message on many forms — so a key
 * alone is ambiguous whenever two of them are on screen at once. That is what `within` and
 * `containing` are for, and why the plugin also stamps each component's root element with
 * its own name: `{ testId: 'common__save', within: 'entry-form' }` is the second form's
 * save button and nothing else.
 */
export const ControlInput = {
  /** The control's i18n message key, e.g. `entry__save`. */
  testId: z.string(),
  /** A containing component's kebab-cased name, e.g. `entry-form`, when the key repeats. */
  within: z.string().optional(),
  /** Text the control (or its row) contains — how one row of a list is singled out. */
  containing: z.string().optional(),
}

export type Control = {
  testId: string
  within?: string
  containing?: string
}

/** The scenario's `within`/`containing` as the selector `@pikku/playwright` locates with. */
export const selectorFor = ({ testId, within, containing }: Control) => ({
  testId,
  ...(containing ? { containing } : {}),
  ...(within ? { within: { testId: within } } : {}),
})

/**
 * The addresses the page is actually offering, as the failure message for a step that
 * could not find its control.
 *
 * Built only once something has already gone wrong, so a passing run never pays for it.
 * This is the one moment the author needs it: the usual causes are a key that reads
 * slightly differently from the scenario, and a control the plugin left unstamped because
 * it has neither a message key nor a `name` — and the second is invisible without this.
 */
export async function addressesOnScreen(actor: ActorSession): Promise<string> {
  try {
    const ids: string[] = await actor.page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid]'))
        .filter((node) => (node as HTMLElement).offsetParent !== null)
        .map((node) => node.getAttribute('data-testid') ?? '')
        .filter(Boolean),
    )
    const unique = [...new Set(ids)].slice(0, 25)
    return unique.length
      ? `The page currently offers: ${unique.join(', ')}.`
      : `The page offers no data-testid at all, which usually means the app was built without the pikku:testids plugin.`
  } catch {
    return ''
  }
}

/** The first line of whatever the driver threw, for a step's own failure message. */
export const underlying = (error: unknown) =>
  error instanceof Error ? error.message.split('\n')[0] : String(error)

/** Where the browser currently rests, or the fallback when it never navigated. */
export function currentPath(actor: ActorSession, fallback = ''): string {
  try {
    return new URL(actor.page.url()).pathname
  } catch {
    return fallback
  }
}

/** `/app/` and `/app` are the same route; compare them as such. */
export const normalisePath = (path: string) => path.replace(/\/+$/, '') || '/'

export const HYDRATED_SELECTOR = 'html[data-app-hydrated="true"]'

/**
 * Server-rendered markup already has a `<main>`, so the driver's `gotoApp` settles before
 * React has attached; a `fill` into an inert input is destroyed by the first render and the
 * scenario fails as "the submit did nothing". The app publishes the attribute from
 * `apps/app/src/routes/__root.tsx` once the router is idle; its absence is fatal on purpose.
 */
export async function readyToBeUsed(actor: ActorSession, timeout = 10_000): Promise<void> {
  try {
    await actor.page.waitForSelector(HYDRATED_SELECTOR, { state: 'attached', timeout })
  } catch {
    throw new Error(
      `The app never declared itself interactive (\`${HYDRATED_SELECTOR}\` was still absent ` +
        `after ${timeout}ms), so anything typed or pressed here would be thrown away by the ` +
        `first render. Check that apps/app/src/routes/__root.tsx still publishes it. ` +
        `The browser rests on ${currentPath(actor)} with: ${await addressesOnScreen(actor)}`,
    )
  }
}
