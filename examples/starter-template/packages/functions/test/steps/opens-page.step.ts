import { z } from 'zod'
import { pikkuScenarioStep } from '#pikku/scenarios'
import { currentPath, session } from '../lib/browser-vocabulary.js'

export const OpensPageInput = z.object({
  /** App-relative path, e.g. `/app`. */
  path: z.string(),
})

export const OpensPageOutput = z.object({
  /** Where the browser actually came to rest — a guard redirect shows up here. */
  pathname: z.string(),
  status: z.number().nullable(),
})

/**
 * Open one app page as the step's actor and report where it landed.
 *
 * Returns rather than asserts: a scenario that expects a redirect and one that
 * forbids it both read the same value, and the landed path appears in the run
 * record either way.
 */
export const opensPage = pikkuScenarioStep({
  name: 'opensPage',
  description: 'opens an app page as the signed-in actor',
  template: 'opens {path}',
  input: OpensPageInput,
  output: OpensPageOutput,
  browser: async (_services, { path }, { browser }) => {
    const actor = session(browser)
    const status = await actor.gotoApp(path)
    return { pathname: currentPath(actor, path), status }
  },
})
