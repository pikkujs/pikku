import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { ActorSession } from './actor-session.js'

/**
 * The "every page loads without errors" sweep — the baseline reliability gate.
 * Enumerates the app's static, param-free routes from every frontend's
 * generated TanStack route tree, so new pages are picked up automatically.
 */
export function staticRoutes(repoRoot: string): string[] {
  const root = resolve(process.cwd(), repoRoot)
  const appsDir = join(root, 'apps')
  const paths = new Set<string>(['/'])
  let appDirs: string[] = []
  try {
    appDirs = readdirSync(appsDir)
  } catch {
    return [...paths]
  }
  for (const app of appDirs) {
    const tree = join(appsDir, app, 'src', 'routeTree.gen.ts')
    if (!existsSync(tree)) continue
    const source = readFileSync(tree, 'utf8')
    const body = source.match(/export interface FileRoutesByFullPath \{([\s\S]*?)\n\}/)?.[1] ?? ''
    for (const match of body.matchAll(/'([^']+)'\s*:/g)) {
      const path = match[1]!
      if (path.includes('$') || path.includes('*') || path.includes('{')) continue
      paths.add(path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path)
    }
  }
  // Auth routes redirect when already signed in (or sign us out) — covered by
  // the auth feature, not the logged-in sweep.
  return [...paths].filter((p) => !/^\/(login|signup|logout)\b/.test(p))
}

/**
 * A failed request that is just Vite's dev dep-optimizer aborting in-flight
 * pre-bundle module loads (it re-optimizes on first hit of a new route, bumps
 * the `?v=` hash, and full-reloads) — a transient, NOT an app bug.
 */
function isViteDepOptimizerAbort(failedRequest: string): boolean {
  return (
    /(?:ERR_ABORTED|net::ERR_FAILED|aborted)/i.test(failedRequest) &&
    /(?:\/@fs\/[^ ]*node_modules|\/node_modules\/\.vite\/|\/\.vite\/deps\/)/.test(failedRequest)
  )
}

export async function sweepAllPages(actor: ActorSession, repoRoot: string) {
  const routes = staticRoutes(repoRoot)
  const failures: string[] = []

  for (const path of routes) {
    let problems: string[] = []
    // Up to 3 attempts. Two transient disruptions produce false failures on the
    // first read: (1) Vite re-optimizing deps aborts the page's module requests
    // then full-reloads; (2) the dev server restarting (boot / file change)
    // 5xx's /api for a few seconds, which drops the session (→ /login redirect)
    // and fails app RPCs. When the only problems look transient, wait for the
    // server to be ready again and retry; a real error still fails.
    for (let attempt = 0; attempt < 3; attempt++) {
      actor.resetIssues()
      let status: number | null = null
      try {
        status = await actor.gotoApp(path)
      } catch (err) {
        problems = [`navigation threw: ${err instanceof Error ? err.message : String(err)}`]
        break
      }

      problems = []
      if (status != null && status >= 400) problems.push(`HTTP ${status}`)

      let pathname = path
      try {
        pathname = new URL(actor.page.url()).pathname
      } catch {
        // keep the requested path
      }
      const redirectedToLogin = pathname.startsWith('/login')
      if (redirectedToLogin) {
        problems.push('redirected to /login (session did not carry or a route guard rejected access)')
      }

      const issues = actor.takeIssues()
      const failedRequests = issues.failedRequests.filter((r) => !isViteDepOptimizerAbort(r))
      const viteAborts = issues.failedRequests.length - failedRequests.length
      // A GATEWAY error (502/503/504) on an app /api call means the edge
      // couldn't reach the upstream — the dev server is (re)starting. A plain
      // 500 is the server UP but a handler THREW — a real code bug — so it must
      // NOT be retried away; it stays in `problems` and fails like any error.
      const gatewayErrors = issues.apiErrors.filter((e) => /^(502|503|504)\b/.test(e))
      if (issues.apiErrors.length) problems.push(`API errors: ${issues.apiErrors.join(', ')}`)
      if (issues.pageErrors.length) problems.push(`uncaught exception: ${issues.pageErrors.join(' | ')}`)
      if (issues.consoleErrors.length) problems.push(`console errors: ${issues.consoleErrors.join(' | ')}`)
      if (failedRequests.length) problems.push(`failed requests: ${failedRequests.join(' | ')}`)

      // Clean read → trust it. If the only disruption was transient (Vite
      // optimizer, a gateway 502/503/504, or a session-loss /login redirect),
      // wait for the server to settle and retry; otherwise stop — the problems
      // are real (a 500, a console/page error, a persistent /login guard).
      const transient = viteAborts > 0 || gatewayErrors.length > 0 || redirectedToLogin
      if (!transient || attempt === 2) break
      await actor.waitForServerReady()
    }

    if (problems.length) failures.push(`  ✗ ${path}\n      ${problems.join('\n      ')}`)
  }

  if (failures.length) {
    throw new Error(
      `${failures.length}/${routes.length} page(s) have runtime errors:\n${failures.join('\n')}\n\n` +
        `Fix each: an API/HTTP error → the pikku function backing that RPC; a console error or ` +
        `hydration mismatch → the page/component; a redirect to /login → the route guard or session. ` +
        `Re-run after fixing.`
    )
  }
}
