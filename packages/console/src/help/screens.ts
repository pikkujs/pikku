import { m } from '@/i18n/messages'

/**
 * Plain-language help for one screen, for someone who has never met the concept.
 * The four prose slots are fixed so every screen says the same kind of thing in
 * the same order; copy carries `[label](#anchor)` spans that point at real
 * controls (see HelpText).
 */
export interface HelpScreen {
  title: () => string
  what: () => string
  behaviour: () => string
  surprise: () => string
  examples: () => string
  whatYouCanDo: Array<() => string>
  docsHref?: string
}

export const HELP_SCREENS: Record<string, HelpScreen> = {
  '/functions': {
    title: m.help_functions_title,
    what: m.help_functions_what,
    behaviour: m.help_functions_behaviour,
    surprise: m.help_functions_surprise,
    examples: m.help_functions_examples,
    whatYouCanDo: [
      m.help_functions_do_search,
      m.help_functions_do_select,
      m.help_functions_do_internals,
    ],
    docsHref: 'https://pikku.dev/docs/core-features/functions',
  },
}

/**
 * Routes that will never carry help, with the reason. A redirect or an embed
 * target has no screen for a reader to be oriented on.
 */
export const HELP_EXEMPT: Record<string, string> = {
  '/': 'redirects to /overview',
  '/config': 'redirects to /secrets',
  '/render/workflow': 'headless embed target, no chrome',
  '*': 'not-found',
}

/**
 * Routes whose copy has not been written yet.
 *
 * This list is the point of the route-keyed registry: an unwritten screen is
 * enumerated here rather than silently rendering nothing, and a NEW route fails
 * `screens.test.ts` until someone classifies it. Deleting an entry from here and
 * adding it to HELP_SCREENS is how this shrinks.
 */
export const HELP_PENDING: readonly string[] = [
  '/overview',
  '/workflow',
  '/agents',
  '/agents/playground',
  '/scorers',
  '/changes',
  '/scenarios',
  '/personas',
  '/virtual-users',
  '/knowledge',
  '/surface',
  '/database',
  '/apis',
  '/jobs',
  '/runtime',
  '/emails',
  '/webhooks',
  '/secrets',
  '/variables',
  '/security',
  '/credentials',
  '/users',
  '/scopes',
  '/audit',
  '/auth-providers',
  '/addons',
]

const HOST_SCREENS: Record<string, HelpScreen> = {}

/**
 * Screens for a host app's own routes (Fabric's project chrome, say). Host keys
 * win over the console's, so a host can also replace one of these screens.
 */
export function registerHelpScreens(screens: Record<string, HelpScreen>): void {
  Object.assign(HOST_SCREENS, screens)
}

/**
 * Resolve a pathname to its screen.
 *
 * Exact match first, then the longest registry key the path ENDS with: a host
 * app mounts these screens under its own prefix (`/acme/projects/x/main/functions`),
 * and the console's own route is the tail of it.
 */
export function resolveHelpScreen(pathname: string): HelpScreen | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  for (const table of [HOST_SCREENS, HELP_SCREENS]) {
    const exact = table[path]
    if (exact) return exact
  }
  let best: HelpScreen | null = null
  let bestLen = -1
  for (const table of [HOST_SCREENS, HELP_SCREENS]) {
    for (const [key, screen] of Object.entries(table)) {
      if (path.endsWith(key) && key.length > bestLen) {
        best = screen
        bestLen = key.length
      }
    }
  }
  return best
}
