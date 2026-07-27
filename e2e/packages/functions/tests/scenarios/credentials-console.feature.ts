/**
 * The console's credential surface, and the gate in front of it.
 *
 * The addon-console credential RPCs are guarded by `console:admin`, and the
 * console UI has to reflect that gate before any of them runs: an admin reaches
 * the page, a non-admin is stopped at the AuthGate. This is the UI-level
 * counterpart to the API-level console authorization scenarios — the gate is
 * asserted twice on purpose, because a UI that renders the page and then fails
 * every request would pass the API-level check alone.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

const CREDENTIALS_PAGE = '/console/credentials'

export const credentialsConsoleAdminScenario = pikkuScenario<
  void,
  { reached: true }
>({
  title: 'An admin reaches the credential connections surface',
  description:
    'The credentials page opens on its global tab and the per-user connections tab is reachable from the page header',
  tags: ['scenario', 'credentials-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'credentialsConsoleAdminScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the credentials page',
      'opensConsolePage',
      { path: CREDENTIALS_PAGE, waitFor: '[data-testid="page-search"]' },
      { actor: actors.admin }
    )
    await scenario.when(
      'switches to the connections tab',
      'selectsTab',
      { value: 'connections' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the per-user connections surface',
      'seesTestId',
      { testId: 'credential-connections' },
      { actor: actors.admin }
    )

    return { reached: true }
  },
})

/**
 * The guest actor signs in perfectly well — it simply holds no admin scope, so
 * the console must refuse it at the gate rather than at a failed request. The
 * distinction matters: the refusal has to happen before the page mounts, which
 * is what stops a privileged RPC being attempted at all.
 */
export const credentialsConsoleNonAdminRefusedScenario = pikkuScenario<
  void,
  { refused: true }
>({
  title: 'A non-admin is refused at the console gate',
  description:
    'A signed-in user without admin access sees the not-authorized screen instead of the console',
  tags: ['scenario', 'credentials-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.guest) {
      throw new Error(
        'credentialsConsoleNonAdminRefusedScenario needs the guest actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the credentials page as the guest',
      'opensConsolePage',
      {
        path: CREDENTIALS_PAGE,
        waitFor: '[data-testid="console-not-authorized"]',
      },
      { actor: actors.guest }
    )
    await scenario.then(
      'sees the not-authorized screen',
      'seesTestId',
      { testId: 'console-not-authorized' },
      { actor: actors.guest }
    )
    await scenario.then(
      'never reaches the credential surface',
      'doesNotSeeTestId',
      { testId: 'credential-connections' },
      { actor: actors.guest }
    )

    return { refused: true }
  },
})

export const credentialsConsoleFeature = pikkuFeature({
  name: 'Credentials Console',
  description: 'The credential surface and the admin gate in front of it',
  tags: ['credentials-console', 'console'],
  scenarios: [
    credentialsConsoleAdminScenario,
    credentialsConsoleNonAdminRefusedScenario,
  ],
})
