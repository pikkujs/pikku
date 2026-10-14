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
 * build. Behaviour scenarios that create, edit or delete belong in their own
 * feature, untagged `smoke`, so the fast gate stays fast and deterministic.
 *
 * `virtualUsers.visitor` below is the template's PLACEHOLDER virtual user. When you replace it
 * with this app's real roles (see AGENTS.md), swap both references here for your
 * primary role — this scenario must name one literally, because PKU677 requires a
 * browser step's virtual user to be a literal `virtualUsers.<name>`.
 */
import { pikkuScenario } from '#pikku/scenarios'

export const everyPageLoadsScenario = pikkuScenario<void, { routes: string[] }>(
  {
    title: 'Every page loads cleanly when signed in',
    description:
      'The baseline reliability gate — no page errors for a signed-in user',
    tags: ['scenario', 'pages', 'smoke'],
    func: async (_services, _data, { scenario, virtualUsers }) => {
      if (!virtualUsers?.visitor) {
        throw new Error(
          'everyPageLoadsScenario needs the visitor virtual user — run via `pikku scenario run <environment>`'
        )
      }
      // `repoRoot` is passed even though the schema defaults it: a step's input
      // type is the schema's OUTPUT, so a defaulted field is still required here.
      const swept = await scenario.then(
        'every page loads without errors',
        'sweepsAllPages',
        { repoRoot: '.' },
        { virtualUser: virtualUsers.visitor }
      )
      return { routes: swept.routes }
    },
  }
)
