/**
 * The console scenarios page: the Flows and Personas views.
 *
 * These carry the intent of two gherkin features, `scenarios-console` and
 * `tests-console`, both of which describe surfaces the console has since moved:
 *
 * - The Workflows/Scenarios/Personas toggle no longer lives on the workflows
 *   page. Scenarios and personas have their own page and the workflows page is
 *   a plain table, so "the workflows view hides scenarios" is asserted on that
 *   workflows entity cards rather than on a toggle.
 * - The Tests page is gone entirely, and with it the "Run tests" button and the
 *   live scenario names it streamed. The console no longer runs anything —
 *   scenarios run through `pikku scenario run` — so what survives of that
 *   feature is that the console lists the scenarios it could tell you about.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

const WORKFLOWS_PAGE = '/console/workflow'
const SCENARIOS_PAGE = '/console/scenarios'
const SCENARIO = 'orderSupportScenario'
const WORKFLOW = 'dslSequentialWorkflow'

export const workflowsExcludeScenariosScenario = pikkuScenario<
  void,
  { separated: true }
>({
  title: 'The workflows page leaves scenarios out',
  description:
    'A scenario is not a workflow to browse, so the workflows table omits it',
  tags: ['scenario'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'workflowsExcludeScenariosScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the workflows page',
      'opensConsolePage',
      { path: WORKFLOWS_PAGE },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the workflow',
      'seesTestId',
      { testId: `entity-card-${WORKFLOW}` },
      { actor: actors.admin }
    )
    await scenario.then(
      'does not see the scenario',
      'doesNotSeeTestId',
      { testId: `entity-card-${SCENARIO}` },
      { actor: actors.admin }
    )

    return { separated: true }
  },
})

export const scenarioFlowsListedScenario = pikkuScenario<
  void,
  { cast: number }
>({
  title: 'The scenarios page lists scenarios with their cast',
  description:
    'A scenario card names the personas the scenario is written to be run by',
  tags: ['scenario'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'scenarioFlowsListedScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the scenarios page',
      'opensConsolePage',
      { path: SCENARIOS_PAGE },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the scenario',
      'seesTestId',
      { testId: `flow-card-${SCENARIO}` },
      { actor: actors.admin }
    )
    await scenario.then(
      'does not see the workflow',
      'doesNotSeeTestId',
      { testId: `flow-card-${WORKFLOW}` },
      { actor: actors.admin }
    )

    const read = await scenario.when(
      'reads the cast',
      'readsFlowCast',
      { flow: SCENARIO },
      { actor: actors.admin }
    )
    const expected = await scenario.then(
      'expects the cast',
      'expectsFlowCast',
      {
        read,
        personas: ['shopper', 'support'],
      }
    )

    return { cast: expected.cast }
  },
})

export const scenarioListIsPopulatedScenario = pikkuScenario<
  void,
  { flows: number }
>({
  title: 'The scenarios page lists the project’s scenarios',
  description:
    'The page the console offers in place of a test runner is not empty',
  tags: ['scenario'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'scenarioListIsPopulatedScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the scenarios page',
      'opensConsolePage',
      { path: SCENARIOS_PAGE },
      { actor: actors.admin }
    )
    const listed = await scenario.then(
      'sees a populated list',
      'seesTestId',
      { testId: 'flow-card-', prefix: true, atLeast: 5 },
      { actor: actors.admin }
    )

    return { flows: listed.count }
  },
})

export const personasListedScenario = pikkuScenario<void, { listed: true }>({
  title: 'The personas view renders the configured actors',
  description:
    'Every persona declared under scenarios.actors is shown with its identity',
  tags: ['scenario'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'personasListedScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the scenarios page',
      'opensConsolePage',
      { path: SCENARIOS_PAGE },
      { actor: actors.admin }
    )
    await scenario.when(
      'switches to the personas view',
      'selectsSegment',
      { value: 'personas' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the shopper',
      'seesTestId',
      { testId: 'persona-card-shopper', containing: 'shopper@actors.local' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the support agent',
      'seesTestId',
      { testId: 'persona-card-support', containing: 'Support agent' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the support agent’s personality',
      'seesTestId',
      {
        testId: 'persona-card-support',
        containing: 'Methodical agent who double-checks every order',
      },
      { actor: actors.admin }
    )

    return { listed: true }
  },
})

export const scenariosViewTogglesBackScenario = pikkuScenario<
  void,
  { restored: true }
>({
  title: 'Switching back to Flows restores the scenario list',
  description: 'The view toggle is reversible',
  tags: ['scenario'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'scenariosViewTogglesBackScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the scenarios page',
      'opensConsolePage',
      { path: SCENARIOS_PAGE },
      { actor: actors.admin }
    )
    await scenario.when(
      'switches to the personas view',
      'selectsSegment',
      { value: 'personas' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees a persona',
      'seesTestId',
      { testId: 'persona-card-shopper' },
      { actor: actors.admin }
    )
    await scenario.when(
      'switches back to the flows view',
      'selectsSegment',
      { value: 'scenarios' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the scenario again',
      'seesTestId',
      { testId: `flow-card-${SCENARIO}` },
      { actor: actors.admin }
    )

    return { restored: true }
  },
})

export const scenariosConsoleFeature = pikkuFeature({
  name: 'Scenarios Console Page',
  description:
    'The console lists the project’s scenarios and the personas that run them',
  tags: ['scenarios-console', 'console'],
  scenarios: [
    workflowsExcludeScenariosScenario,
    scenarioFlowsListedScenario,
    scenarioListIsPopulatedScenario,
    personasListedScenario,
    scenariosViewTogglesBackScenario,
  ],
})
