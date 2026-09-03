/**
 * Impersonation in the console, which is deliberately *scoped*: it overlays the
 * execution surfaces (workflows, agents, APIs) while the console chrome keeps
 * running as the signed-in admin.
 *
 * That split is the whole feature, so the scenario asserts both halves against
 * the same impersonation session — a console that impersonated everything, or
 * nothing, would satisfy one half each and has to fail here.
 *
 * A user is identified here by the email the row already renders, never by a
 * `data-` attribute carrying it. An email is personal data, and putting it in
 * an attribute would publish it to anything reading the DOM — a session
 * recorder, an analytics script, an extension — for the sake of a selector.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const USERS_PAGE = '/console/users'
const IMPERSONATED = 'guest@e2e.test'
const ADMIN = 'admin@e2e.test'

export const impersonationConsoleScopeScenario = pikkuScenario<
  void,
  { scoped: true }
>({
  title: 'Impersonation scopes to execution, not the console chrome',
  description:
    'A workflow started while impersonating carries the impersonation header; the console reading its own users directory does not',
  tags: ['scenario', 'impersonation-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'impersonationConsoleScopeScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the users page',
      'opensConsolePage',
      { path: USERS_PAGE, waitFor: { testId: 'user-row' } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the user it is about to impersonate',
      'seesTestId',
      { testId: 'user-row', containing: IMPERSONATED },
      { actor: actors.admin }
    )

    await scenario.when(
      'impersonates that user',
      'impersonatesUser',
      { email: IMPERSONATED },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the impersonation banner name them',
      'seesTestId',
      { testId: 'impersonation-banner', containing: IMPERSONATED },
      { actor: actors.admin }
    )

    const chrome = await scenario.when(
      'searches the users directory while impersonating',
      'searchesUsers',
      { query: ADMIN },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the searched user',
      'seesTestId',
      { testId: 'user-row', containing: ADMIN },
      { actor: actors.admin }
    )
    await scenario.then(
      'finds no impersonation header on the console chrome',
      'expectsImpersonationHeader',
      {
        requests: chrome.requests,
        urlContains: '/rpc/admin:listUsers',
        present: false,
      }
    )

    await scenario.when(
      'navigates to the workflows page',
      'navigatesInConsole',
      { page: 'Workflows', href: '/workflow' },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens the workflow',
      'clicksTestId',
      { testId: 'entity-card-dslSequentialWorkflow' },
      { actor: actors.admin }
    )

    const execution = await scenario.when(
      'starts a workflow run while impersonating',
      'startsWorkflowRunFromConsole',
      { input: { value: '5', name: 'ImpersonatedRun' } },
      { actor: actors.admin }
    )
    await scenario.then(
      'finds the impersonation header on the workflow start',
      'expectsImpersonationHeader',
      {
        requests: execution.requests,
        urlContains: '/workflow/dslSequentialWorkflow/start',
        present: true,
      }
    )

    await scenario.when(
      'stops impersonating',
      'stopsImpersonating',
      undefined,
      {
        actor: actors.admin,
      }
    )
    await scenario.then(
      'no longer sees the impersonation banner',
      'doesNotSeeTestId',
      { testId: 'impersonation-banner' },
      { actor: actors.admin }
    )

    return { scoped: true }
  },
})

export const impersonationConsoleFeature = pikkuFeature({
  name: 'Impersonation Console',
  description: 'Impersonation overlays execution without touching the console',
  tags: ['impersonation-console', 'console'],
  scenarios: [impersonationConsoleScopeScenario],
})
