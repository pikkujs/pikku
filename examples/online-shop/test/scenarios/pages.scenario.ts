/**
 * Replaces e2e/tests/features/pages.feature — the build gate.
 *
 * Signed in, every static route must render without an HTTP error, a failed or
 * 5xx app API call, an uncaught exception, or a console error. Routes are read
 * from the generated route tree, so a page added today is swept today; nothing
 * here lists them.
 *
 * This is mutationless on purpose — it signs in and navigates, nothing more —
 * which is what makes it safe to run against the live dev server on every
 * build. Behaviour tests that create, edit or delete belong in their own
 * feature, untagged `smoke`, so the fast gate stays fast and deterministic.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenarios'

export const everyPageLoadsScenario = pikkuScenario<void, { routes: string[] }>(
  {
    title: 'Every page loads cleanly when signed in',
    description:
      'The baseline reliability gate — no page errors for a signed-in user',
    tags: ['scenario', 'pages', 'smoke'],
    func: async (_services, _data, { scenario, actors }) => {
      if (!actors?.visitor) {
        throw new Error(
          'everyPageLoadsScenario needs the visitor actor — run via `pikku scenario run <environment>`'
        )
      }
      // `repoRoot` is passed even though the schema defaults it: a step's input
      // type is the schema's OUTPUT, so a defaulted field is still required here.
      //
      // '../..' and not '.': scenarios run with the cwd at packages/functions, and
      // `staticRoutes` looks for `<repoRoot>/apps/*/src/routeTree.gen.ts`. Pointed
      // at the wrong root it finds no route tree, falls back to ['/'] and passes —
      // a green gate that swept one page and claimed to have swept them all.
      const swept = await scenario.then(
        'every page loads without errors',
        'sweepsAllPages',
        { repoRoot: '../..' },
        { actor: actors.visitor }
      )
      return { routes: swept.routes }
    },
  }
)

export const pagesFeature = pikkuFeature({
  name: 'Every page loads',
  description: 'Every static route renders cleanly for a signed-in user',
  tags: ['pages', 'smoke'],
  scenarios: [everyPageLoadsScenario],
})
