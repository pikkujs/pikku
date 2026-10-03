import { z } from 'zod'
import { staticRoutes, sweepAllPages } from '@pikku/playwright'
import { pikkuScenarioStep } from '#pikku/scenarios'
import { session } from '../lib/browser-vocabulary.js'

export const SweepsAllPagesInput = z.object({
  /**
   * Where each app's generated `src/routeTree.gen.ts` is read from, relative to
   * the directory `pikku scenario run` was invoked in — the repo root, hence `.`.
   */
  repoRoot: z.string().default('.'),
})

export const SweepsAllPagesOutput = z.object({
  routes: z.array(z.string()),
})

/**
 * Visit every static route and fail on the first page that is not clean.
 *
 * "Clean" means: no HTTP error, no failed or 5xx app API call, no uncaught
 * exception, no console error, and no bounce to `/app/auth/login`. Routes come from the
 * generated TanStack route tree, so a new page is swept the moment it exists —
 * nothing here lists them. Parameterised routes and the auth pages are skipped
 * by `staticRoutes`.
 *
 * `sweepAllPages` retries a page whose only problems are transient (an aborted
 * request, a 502/503/504, a login bounce during a dev-server restart), so a
 * failure reported here is a failure that survived three attempts.
 */
export const sweepsAllPages = pikkuScenarioStep({
  name: 'sweepsAllPages',
  description: 'visits every static route and fails on any runtime error',
  template: 'every page loads without errors',
  input: SweepsAllPagesInput,
  output: SweepsAllPagesOutput,
  browser: async (_services, { repoRoot }, { browser }) => {
    const actor = session(browser)
    await actor.waitForServerReady()
    await sweepAllPages(actor, repoRoot)
    return { routes: staticRoutes(repoRoot) }
  },
})
