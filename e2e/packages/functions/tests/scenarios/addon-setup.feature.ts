/**
 * An installed addon's Setup tab: the OAuth integrations and secrets it needs,
 * and how those resolve when the package is wired more than once.
 *
 * Both scenarios assert status through data attributes rather than the rendered
 * "Not connected" / "Set" copy. That copy goes through the `m` namespace, so
 * reading it back is an assertion about the console's English rather than about
 * whether the requirement is satisfied.
 *
 * The fixtures pick themselves: `@pikku/addon-fake-crm` declares one OAuth2
 * integration and one plain secret, so both requirement kinds appear on one
 * page; `@pikku/addon-mailgun` is wired twice — once bare and once remapping
 * MAILGUN_CREDENTIALS to MAILGUN_PROMO_CREDENTIALS — so the instance selector
 * has something to switch between.
 */
import {
  pikkuFeature,
  pikkuScenario,
  pikkuScenarioHook,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

const FAKE_CRM_SETUP =
  '/console/addons?id=%40pikku%2Faddon-fake-crm&source=installed'
const MAILGUN_SETUP =
  '/console/addons?id=%40pikku%2Faddon-mailgun&source=installed'
const OAUTH_CARD = 'oauth-requirement-fake-crm'
const SECRET_CARD = 'secret-requirement-fakeCrmApiKey'
const MAILGUN_CARD = 'secret-requirement-mailgun'
const INSTANCE_SELECT = 'addon-instance-select'

/**
 * Unlinks what the scenario connected.
 *
 * The fake-crm credential is a singleton, so once linked it is platform-owned
 * and every user reads it back — including the users the credential API
 * scenarios expect to own nothing. Those suites ran in a separate process under
 * cucumber and never saw this; in one serial run the link has to be given back.
 * Doing it in `after` also lets the scenario start from "Not connected" on a
 * second run against the same server.
 */
const disconnectsFakeCrm = pikkuScenarioHook(
  async (_services, _data, { actors }) => {
    await actors.admin.invoke('console:credentialDelete', {
      name: 'fake-crm',
    })
  }
)

export const addonRequirementsScenario = pikkuScenario<void, { setUp: true }>({
  after: disconnectsFakeCrm,
  title: 'An addon’s missing requirements are surfaced, then satisfied inline',
  description:
    'The Setup tab flags the integration and the secret as missing, and both can be satisfied without leaving it',
  tags: ['scenario'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'addonRequirementsScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the addon’s setup',
      'opensConsolePage',
      { path: FAKE_CRM_SETUP, waitFor: { testId: OAUTH_CARD } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the integration unconnected',
      'seesTestId',
      { testId: OAUTH_CARD, where: { 'data-connected': 'false' } },
      { actor: actors.admin }
    )
    await scenario.then(
      'is offered the connect action',
      'expectsControl',
      { testId: 'requirement-connect-fake-crm', enabled: true },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the secret unset',
      'seesTestId',
      { testId: SECRET_CARD, where: { 'data-set': 'false' } },
      { actor: actors.admin }
    )

    await scenario.when(
      'opens the secret editor',
      'clicksTestId',
      { testId: 'secret-set-fakeCrmApiKey' },
      { actor: actors.admin }
    )
    await scenario.when(
      'types the secret',
      'fillsTestId',
      { testId: 'secret-input-fakeCrmApiKey', value: 'sk-fake-123' },
      { actor: actors.admin }
    )
    await scenario.when(
      'saves the secret',
      'clicksTestId',
      { testId: 'secret-save-fakeCrmApiKey' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the secret set',
      'seesTestId',
      { testId: SECRET_CARD, where: { 'data-set': 'true' } },
      { actor: actors.admin }
    )

    await scenario.when(
      'connects the integration',
      'clicksTestId',
      { testId: 'requirement-connect-fake-crm' },
      { actor: actors.admin }
    )
    // Connecting redirects the whole page out to the mock provider, which
    // auto-approves and lands back here. The callback URL is this same page, so
    // waiting on the url would match immediately and prove nothing — the end
    // state is the card, which only flips once the token has been stored and
    // the status query has re-run.
    await scenario.then(
      'sees the integration connected',
      'seesTestId',
      {
        testId: OAUTH_CARD,
        where: { 'data-connected': 'true' },
        timeoutMs: 30_000,
      },
      { actor: actors.admin }
    )

    return { setUp: true }
  },
})

export const addonInstanceOverridesScenario = pikkuScenario<
  void,
  { resolved: true }
>({
  title: 'The Setup tab resolves a secret against the selected instance',
  description:
    'Two instances of one package must not share a secret, so each resolves the addon’s logical name through its own overrides',
  tags: ['scenario'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'addonInstanceOverridesScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the addon’s setup',
      'opensConsolePage',
      { path: MAILGUN_SETUP, waitFor: { testId: INSTANCE_SELECT } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the instance selector',
      'seesTestId',
      { testId: INSTANCE_SELECT },
      { actor: actors.admin }
    )

    await scenario.when(
      'selects the bare instance',
      'selectsOption',
      { testId: INSTANCE_SELECT, value: 'mailgun' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the addon’s own secret',
      'seesTestId',
      {
        testId: MAILGUN_CARD,
        where: { 'data-secret-id': 'MAILGUN_CREDENTIALS' },
      },
      { actor: actors.admin }
    )

    await scenario.when(
      'selects the remapped instance',
      'selectsOption',
      { testId: INSTANCE_SELECT, value: 'mailgun-promo' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the remapped secret',
      'seesTestId',
      {
        testId: MAILGUN_CARD,
        where: { 'data-secret-id': 'MAILGUN_PROMO_CREDENTIALS' },
      },
      { actor: actors.admin }
    )

    return { resolved: true }
  },
})

export const addonSetupFeature = pikkuFeature({
  name: 'Addon Setup',
  description:
    'An installed addon declares what it needs, and the console lets you satisfy it',
  tags: ['addon-setup-console', 'console'],
  scenarios: [addonRequirementsScenario, addonInstanceOverridesScenario],
})
