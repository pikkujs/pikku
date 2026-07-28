/**
 * The console scenarios page: living documentation of what this project's
 * features are written to do.
 *
 * These carry the intent of two gherkin features, `scenarios-console` and
 * `tests-console`, both of which describe surfaces the console has since moved:
 *
 * - The Workflows/Scenarios/Personas toggle no longer lives on the workflows
 *   page. Scenarios have their own page and the workflows page is a plain
 *   table, so "the workflows view hides scenarios" is asserted on that
 *   workflows entity cards rather than on a toggle.
 * - The Tests page is gone entirely, and with it the "Run tests" button and the
 *   live scenario names it streamed. The console no longer runs anything —
 *   scenarios run through `pikku scenario run` — so what survives of that
 *   feature is that the console reads back the scenarios it knows about.
 * - The scenarios page itself is no longer a card list behind a Flows/Personas
 *   segmented control. It is a document: features on the left, and on the
 *   right the selected feature's scenarios, each as its declared prose ladder.
 *   Personas are still first-class, but they read inline as a scenario's cast
 *   rather than as a separate view.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

const WORKFLOWS_PAGE = '/console/workflow'
const SCENARIOS_PAGE = '/console/scenarios'
const SCENARIO = 'orderSupportScenario'
const WORKFLOW = 'dslSequentialWorkflow'

/** The synthetic feature holding scenarios that declare no `pikkuFeature`. */
const UNGROUPED = '__ungrouped'

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

export const featuresNavigableScenario = pikkuScenario<
  void,
  { features: number }
>({
  title: 'The scenarios page opens on a feature',
  description:
    'Features are the pages of the document, so the page lists them and opens one',
  tags: ['scenario'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'featuresNavigableScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the scenarios page',
      'opensConsolePage',
      { path: SCENARIOS_PAGE },
      { actor: actors.admin }
    )
    const listed = await scenario.then(
      'sees a populated feature list',
      'seesTestId',
      { testId: 'feature-nav-', prefix: true, atLeast: 5 },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens the addons feature',
      'clicksTestId',
      { testId: 'feature-nav-addonsFeature' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the addons feature document',
      'seesTestId',
      { testId: 'feature-document-addonsFeature' },
      { actor: actors.admin }
    )

    return { features: listed.count }
  },
})

export const scenarioReadsAsProseScenario = pikkuScenario<void, { read: true }>(
  {
    title: 'A scenario reads as the prose its author wrote',
    description:
      'The steps of a scenario are its sentences, shown in the order they were declared',
    tags: ['scenario'],
    func: async (_services, _data, { scenario, actors }) => {
      if (!actors?.admin) {
        throw new Error(
          'scenarioReadsAsProseScenario needs the admin actor — run via `pikku scenario run <environment>`'
        )
      }

      await scenario.given(
        'opens the scenarios page',
        'opensConsolePage',
        { path: SCENARIOS_PAGE },
        { actor: actors.admin }
      )
      await scenario.when(
        'opens the ungrouped feature',
        'clicksTestId',
        { testId: `feature-nav-${UNGROUPED}` },
        { actor: actors.admin }
      )
      await scenario.then(
        'sees the scenario section',
        'seesTestId',
        { testId: `scenario-section-${SCENARIO}` },
        { actor: actors.admin }
      )
      await scenario.then(
        'sees the shopper’s step in the author’s words',
        'seesTestId',
        { testId: 'ladder-step-shopper doubles their order' },
        { actor: actors.admin }
      )
      await scenario.then(
        'sees the support agent’s step in the author’s words',
        'seesTestId',
        { testId: 'ladder-step-support sees the greeting settle' },
        { actor: actors.admin }
      )

      return { read: true }
    },
  }
)

export const scenarioCastListedScenario = pikkuScenario<void, { cast: number }>(
  {
    title: 'A scenario names the personas it casts',
    description:
      'The personas a scenario is written to be run by read alongside it, not on a page of their own',
    tags: ['scenario'],
    func: async (_services, _data, { scenario, actors }) => {
      if (!actors?.admin) {
        throw new Error(
          'scenarioCastListedScenario needs the admin actor — run via `pikku scenario run <environment>`'
        )
      }

      await scenario.given(
        'opens the scenarios page',
        'opensConsolePage',
        { path: SCENARIOS_PAGE },
        { actor: actors.admin }
      )
      await scenario.when(
        'opens the ungrouped feature',
        'clicksTestId',
        { testId: `feature-nav-${UNGROUPED}` },
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
      await scenario.when(
        'opens the shopper',
        'clicksTestId',
        {
          testId: 'scenario-cast-member',
          where: { 'data-persona-key': 'shopper' },
          within: { testId: `scenario-section-${SCENARIO}` },
        },
        { actor: actors.admin }
      )
      await scenario.then(
        'sees the shopper’s identity',
        'seesTestId',
        { testId: 'persona-drawer-shopper' },
        { actor: actors.admin }
      )

      return { cast: expected.cast }
    },
  }
)

export const scenarioStepOpensAsStepScenario = pikkuScenario<
  void,
  { opened: true }
>({
  title: 'A step opens as the step it is, not as a bare RPC',
  description:
    'The details of a step name the phase it runs in, the actor it runs as, and the scenario step behind the sentence',
  tags: ['scenario'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'scenarioStepOpensAsStepScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the scenarios page',
      'opensConsolePage',
      { path: SCENARIOS_PAGE },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens the ungrouped feature',
      'clicksTestId',
      { testId: `feature-nav-${UNGROUPED}` },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens a step',
      'clicksTestId',
      { testId: 'ladder-step-shopper doubles their order' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the phase the step runs in',
      'seesTestId',
      { testId: 'scenario-step-phase' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the actor the step runs as',
      'seesTestId',
      { testId: 'scenario-step-actor', containing: 'Shopper' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the scenario step behind the sentence',
      'seesTestId',
      { testId: 'scenario-step-rpc', containing: 'doubleValue' },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens the code tab',
      'clicksTestId',
      { testId: 'scenario-step-tab-code' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the code the step runs',
      'seesTestId',
      { testId: 'scenario-step-code', containing: 'value' },
      { actor: actors.admin }
    )

    return { opened: true }
  },
})

export const personaLinkStaysInTheDocumentScenario = pikkuScenario<
  void,
  { revealed: true }
>({
  title: 'A persona’s scenario link reads the scenario, not a graph of it',
  description:
    'Every scenario is documented as the prose it was written in, so following one from its cast lands back in the document',
  tags: ['scenario'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'personaLinkStaysInTheDocumentScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the scenarios page',
      'opensConsolePage',
      { path: SCENARIOS_PAGE },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens the ungrouped feature',
      'clicksTestId',
      { testId: `feature-nav-${UNGROUPED}` },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens the shopper',
      'clicksTestId',
      {
        testId: 'scenario-cast-member',
        where: { 'data-persona-key': 'shopper' },
        within: { testId: `scenario-section-${SCENARIO}` },
      },
      { actor: actors.admin }
    )
    await scenario.when(
      'follows a scenario the shopper is cast in',
      'clicksTestId',
      { testId: `persona-scenario-${SCENARIO}` },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the scenario read as prose',
      'seesTestId',
      { testId: `ladder-step-shopper doubles their order` },
      { actor: actors.admin }
    )

    return { revealed: true }
  },
})

export const skippedScenarioSaysWhyScenario = pikkuScenario<
  void,
  { explained: true }
>({
  title: 'A skipped scenario says why it is skipped',
  description:
    'Documentation that hides what is not running is documentation that lies',
  tags: ['scenario'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'skippedScenarioSaysWhyScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the scenarios page',
      'opensConsolePage',
      { path: SCENARIOS_PAGE },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens the install-addon feature',
      'clicksTestId',
      { testId: 'feature-nav-consoleInstallAddonFeature' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the skipped scenario explain itself',
      'seesTestId',
      {
        testId: 'scenario-skip',
        containing: 'npm cannot install inside this yarn workspace',
        within: {
          testId: 'scenario-section-installAddonFreshNameScenario',
        },
      },
      { actor: actors.admin }
    )

    return { explained: true }
  },
})

export const tagFilterNarrowsScenario = pikkuScenario<void, { narrowed: true }>(
  {
    title: 'A tag narrows the document to the slice it names',
    description:
      'The same tags `pikku scenario run --tags` selects on also navigate the document',
    tags: ['scenario'],
    func: async (_services, _data, { scenario, actors }) => {
      if (!actors?.admin) {
        throw new Error(
          'tagFilterNarrowsScenario needs the admin actor — run via `pikku scenario run <environment>`'
        )
      }

      await scenario.given(
        'opens the scenarios page',
        'opensConsolePage',
        { path: SCENARIOS_PAGE },
        { actor: actors.admin }
      )
      await scenario.then(
        'sees an untagged feature listed',
        'seesTestId',
        { testId: 'feature-nav-workflowApiFeature' },
        { actor: actors.admin }
      )
      await scenario.when(
        'filters to the addons tag',
        'selectsOption',
        { testId: 'scenario-tag-filter', value: 'addons' },
        { actor: actors.admin }
      )
      await scenario.then(
        'still sees the addons feature',
        'seesTestId',
        { testId: 'feature-nav-addonsFeature' },
        { actor: actors.admin }
      )
      await scenario.then(
        'no longer sees the workflow feature',
        'doesNotSeeTestId',
        { testId: 'feature-nav-workflowApiFeature' },
        { actor: actors.admin }
      )

      return { narrowed: true }
    },
  }
)

export const scenariosConsoleFeature = pikkuFeature({
  name: 'Scenarios Console Page',
  description:
    'The console reads a project’s features back as living documentation: the scenarios they declare, the prose those scenarios are written in, and the personas that run them',
  tags: ['scenarios-console', 'console'],
  scenarios: [
    workflowsExcludeScenariosScenario,
    featuresNavigableScenario,
    scenarioReadsAsProseScenario,
    scenarioCastListedScenario,
    scenarioStepOpensAsStepScenario,
    personaLinkStaysInTheDocumentScenario,
    skippedScenarioSaysWhyScenario,
    tagFilterNarrowsScenario,
  ],
})
