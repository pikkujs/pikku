import { z } from 'zod'
import { pikkuScenarioStep } from '#pikku/scenarios'
import { normalisePath, session } from '../lib/browser-vocabulary.js'

export const RestsOnPathInput = z.object({
  /** App-relative path the actor should have come to rest on, e.g. `/app`. */
  path: z.string(),
})

export const RestsOnPathOutput = z.object({
  pathname: z.string(),
})

/**
 * Assert the browser came to rest on exactly a path, naming where it went if not.
 *
 * This is the assertion half of `opensPage`, which deliberately only reports
 * where it landed. Keeping it a step rather than an `if`/`throw` in the scenario
 * body is what makes it count toward witness coverage — an assertion-free ladder
 * proves only that nothing threw, and the inspector fails the build over it
 * (PKU680).
 *
 * It asserts on the URL rather than page copy because every scaffolded app
 * rewrites its own copy; the route guard's behaviour is what the template can
 * still speak for. The match is exact rather than a prefix on purpose — the
 * redirect this exists to catch is `/app` → `/app/auth/login`, which any prefix test
 * would happily accept.
 */
export const restsOnPath = pikkuScenarioStep({
  name: 'restsOnPath',
  description: 'asserts the browser came to rest on an app path',
  template: 'is on {path}',
  input: RestsOnPathInput,
  output: RestsOnPathOutput,
  browser: async (_services, { path }, { browser }) => {
    const actor = session(browser)
    const pathname = new URL(actor.page.url()).pathname
    if (normalisePath(pathname) !== normalisePath(path)) {
      throw new Error(
        `Expected to be on ${path}, but the browser rests on ${pathname}. ` +
          `A bounce to a login route means the session cookie did not carry, or the route guard rejected it.`,
      )
    }
    return { pathname }
  },
})
