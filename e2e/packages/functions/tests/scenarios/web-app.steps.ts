/**
 * The browser-side verbs the `@pikku/react` app needs and the console never
 * did: what the cookie jar holds, and when the analytics client has had time
 * to send.
 *
 * Cookies are read off the actor's own context rather than through
 * `document.cookie`, because the ids under test are written `httpOnly` — a
 * page that could read them would be failing the thing being asserted.
 */
import { pikkuScenarioStep } from '#pikku/scenario'

/**
 * Long enough for the app's 1s flush timer to have fired at least once.
 *
 * A wait rather than a poll on the destination: the claim is that the client
 * sends on its own, unprompted, which a loop that keeps asking until something
 * arrives would pass even if nothing ever did.
 */
const FLUSH_WINDOW_MS = 3_000

export const waitsForAnalyticsFlush = pikkuScenarioStep<
  void,
  { waitedMs: number }
>({
  name: 'waitsForAnalyticsFlush',
  description: 'waits for the analytics client to send on its own timer',
  template: 'waits for the analytics client to flush',
  browser: async (_services, _data, { browser }) => {
    await browser.page.waitForTimeout(FLUSH_WINDOW_MS)
    return { waitedMs: FLUSH_WINDOW_MS }
  },
})

export const readsBrowserCookie = pikkuScenarioStep<
  { name: string },
  { name: string; value?: string }
>({
  name: 'readsBrowserCookie',
  description: 'reads one cookie out of the browser’s own jar',
  template: 'reads the {name} cookie',
  browser: async (_services, { name }, { browser }) => {
    const cookies = await browser.context.cookies()
    return { name, value: cookies.find((c) => c.name === name)?.value }
  },
})

/**
 * What the jar should hold, asserted against an earlier read where the point
 * is that nothing changed.
 *
 * `sameAs` is the device-id claim: one visitor browsing two pages must come
 * back as one person, and a resolver that minted per request would give them
 * two identities without either request looking wrong on its own.
 */
export const expectsBrowserCookie = pikkuScenarioStep<
  {
    read: { name: string; value?: string }
    present: boolean
    sameAs?: { value?: string }
  },
  { value?: string }
>({
  name: 'expectsBrowserCookie',
  description: 'expects a cookie to be held, or not, and to be unchanged',
  template: 'expects the cookie to be as stated',
  default: async (_services, { read, present, sameAs }) => {
    if (present && read.value === undefined) {
      throw new Error(`Expected a ${read.name} cookie, the jar holds none`)
    }
    if (!present && read.value !== undefined) {
      throw new Error(
        `Expected no ${read.name} cookie, the jar holds ${read.value}`
      )
    }
    if (sameAs !== undefined && read.value !== sameAs.value) {
      throw new Error(
        `Expected ${read.name} to still be ${String(sameAs.value)}, got ${String(read.value)}`
      )
    }
    return { value: read.value }
  },
})
