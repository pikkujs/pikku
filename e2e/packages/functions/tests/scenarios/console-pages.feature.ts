/**
 * Three console pages whose subject is local to the machine serving them: the
 * security audit, the state diff, and the webhook delivery log.
 *
 * The security assertions moved off the report's headings onto the report
 * itself. The audit view now switches between an issues lens and a dependency
 * lens instead of always rendering a "Vulnerabilities" and an "Available
 * updates" section, so the gherkin's two text assertions had nothing to match;
 * what they meant — the audit ran and a report is on screen — is asserted on
 * the report element, which is also immune to the console being translated.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/scenarios/pikku-scenario-types.gen.js'

const SECURITY_PAGE = '/console/security'
const WEBHOOKS_PAGE = '/console/webhooks'

export const securityEmptyStateScenario = pikkuScenario<void, { empty: true }>({
  title: 'The security page shows an empty state before any audit',
  description: 'With no audit report on disk there is no report to show',
  tags: ['scenario', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'securityEmptyStateScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given('resets the audit', 'resetsSecurityAudit', undefined, {
      actor: actors.admin,
    })
    await scenario.when(
      'opens the security page',
      'opensConsolePage',
      { path: SECURITY_PAGE, waitFor: { testId: 'security-run-audit' } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees no report',
      'doesNotSeeTestId',
      { testId: 'security-audit' },
      { actor: actors.admin }
    )

    return { empty: true }
  },
})

export const securityAuditRunScenario = pikkuScenario<void, { audited: true }>({
  title: 'Running the audit renders the report',
  description:
    'The audit runs to completion and its report replaces the empty state',
  tags: ['scenario', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'securityAuditRunScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given('resets the audit', 'resetsSecurityAudit', undefined, {
      actor: actors.admin,
    })
    await scenario.given(
      'opens the security page',
      'opensConsolePage',
      { path: SECURITY_PAGE, waitFor: { testId: 'security-run-audit' } },
      { actor: actors.admin }
    )
    await scenario.when(
      'runs the audit',
      'clicksTestId',
      { testId: 'security-run-audit' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the report',
      'seesTestId',
      { testId: 'security-audit' },
      { actor: actors.admin }
    )
    // This repository is a yarn workspace, and only bun's audit output is
    // normalised, so the run here cannot produce advisories. What it must still
    // do is say so — both in the artefact and on screen — rather than render
    // the clean state, which would tell the reader they have no vulnerabilities
    // when nothing was ever checked.
    await scenario.then(
      'the report says which tool audited it',
      'expectsAuditReport',
      { tool: 'yarn', couldNotRun: true },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees that the audit could not run',
      'seesTestId',
      { testId: 'security-not-run' },
      { actor: actors.admin }
    )

    return { audited: true }
  },
})

export const changesDiffScenario = pikkuScenario<void, { diffed: true }>({
  title: 'The changes page diffs two project states',
  description:
    'A added function and its added HTTP wiring are both counted and named',
  tags: ['scenario', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'changesDiffScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'compares the two fixture states',
      'opensChangesPage',
      { ours: 'state-diff/ours', base: 'state-diff/base' },
      { actor: actors.admin }
    )
    await scenario.then(
      'expects the function counts',
      'expectsTabCounts',
      { tab: 'Functions', added: 1, modified: 1 },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the added function',
      'seesText',
      { text: 'newFunc' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the modified function',
      'seesText',
      { text: 'modifiedFunc' },
      { actor: actors.admin }
    )

    await scenario.when(
      'switches to the HTTP tab',
      'clicksTab',
      { name: 'HTTP' },
      { actor: actors.admin }
    )
    await scenario.then(
      'expects the HTTP counts',
      'expectsTabCounts',
      { tab: 'HTTP', added: 1 },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the added route',
      'seesText',
      { text: '/new' },
      { actor: actors.admin }
    )

    return { diffed: true }
  },
})

export const webhookDeliveryScenario = pikkuScenario<void, { delivered: true }>(
  {
    title: 'A delivered webhook shows on the console with its attempt history',
    description:
      'The delivery log names the target, reports it delivered, and keeps the attempt',
    tags: ['scenario', 'console'],
    func: async (_services, _data, { scenario, actors }) => {
      if (!actors?.admin) {
        throw new Error(
          'webhookDeliveryScenario needs the admin actor — run via `pikku scenario run <environment>`'
        )
      }

      const delivery = await scenario.given(
        'delivers a webhook to the sink',
        'triggersWebhookDelivery',
        {},
        { actor: actors.admin }
      )
      await scenario.when(
        'opens the webhooks page',
        'opensConsolePage',
        { path: WEBHOOKS_PAGE, waitFor: { testId: 'data-table' } },
        { actor: actors.admin }
      )
      await scenario.then(
        'sees the delivery',
        'seesTableRow',
        { containing: delivery.sinkUrl, andContaining: 'delivered' },
        { actor: actors.admin }
      )
      await scenario.when(
        'opens the delivery',
        'opensWebhookDelivery',
        delivery,
        { actor: actors.admin }
      )
      await scenario.then(
        'sees the first attempt',
        'expectsDeliveryAttempt',
        { attempt: '#1', status: 200 },
        { actor: actors.admin }
      )

      return { delivered: true }
    },
  }
)

export const consolePagesFeature = pikkuFeature({
  name: 'Console Local Pages',
  description:
    'The security audit, the state diff and the webhook delivery log',
  tags: ['console'],
  scenarios: [
    securityEmptyStateScenario,
    securityAuditRunScenario,
    changesDiffScenario,
    webhookDeliveryScenario,
  ],
})
