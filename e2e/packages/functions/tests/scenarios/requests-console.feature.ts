/**
 * The console's Requests page on a project that is not linked to Fabric.
 *
 * Unlinked, the queue is the project's own `.studio/changes.json`, so filing,
 * starting and finishing a request runs end to end with no Fabric behind it.
 * The runner shares one server and one project folder with no reset between
 * runs, so the scenario dismisses what it filed, and every row it acts on is
 * selected by its title and its section together.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const REQUESTS_PAGE = '/console/requests'
const TITLE = 'Make the sign-up button bigger'

const row = (section: string) => ({
  testId: 'request-row',
  where: { 'data-title': TITLE, 'data-section': section },
})

export const requestsLifecycleScenario = pikkuScenario<void, { finished: true }>({
  title: 'A request is filed, started and finished from the console',
  description:
    'On a project only on this computer, the owner keeps their own to-do list for the app',
  tags: ['scenario', 'requests-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'requestsLifecycleScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the requests page',
      'opensConsolePage',
      { path: REQUESTS_PAGE, waitFor: { testId: 'requests-new-open' } },
      { actor: actors.admin }
    )
    await scenario.when(
      'starts a new request',
      'clicksTestId',
      { testId: 'requests-new-open' },
      { actor: actors.admin }
    )
    await scenario.when(
      'says what should change',
      'fillsTestId',
      { testId: 'requests-new-title', value: TITLE },
      { actor: actors.admin }
    )
    await scenario.when(
      'adds it',
      'clicksTestId',
      { testId: 'requests-new-submit' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees it waiting to be started',
      'seesTestId',
      row('waiting'),
      { actor: actors.admin }
    )
    await scenario.then(
      'photographs the queue',
      'capturesTheScreen',
      { description: 'requests-waiting' },
      { actor: actors.admin }
    )

    await scenario.when(
      'starts it',
      'clicksTestId',
      { testId: 'request-start', where: { 'data-title': TITLE } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees it being worked on',
      'seesTestId',
      row('working'),
      { actor: actors.admin }
    )

    await scenario.when(
      'marks it done',
      'clicksTestId',
      { testId: 'request-done', where: { 'data-title': TITLE } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the finished section',
      'seesTestId',
      { testId: 'requests-finished' },
      { actor: actors.admin }
    )

    return { finished: true }
  },
})

export const requestsConsoleFeature = pikkuFeature({
  name: 'Requests Console',
  description: 'The to-do list for the app, kept in the project when it is not linked to Fabric',
  tags: ['requests-console', 'console'],
  scenarios: [requestsLifecycleScenario],
})
