/**
 * The console's record of past runs.
 *
 * `pikku scenario run` files every invocation into a run store — the scenarios
 * it selected, the sentences they were made of, and the screenshots and footage
 * they produced — and the console reads that store back as a lens over the
 * suite. These scenarios are necessarily self-referential: the run they find is
 * the one they are being executed by, which is exactly the claim worth proving.
 * A store that only fills in after the process exits would be no use to anyone
 * watching a suite go.
 *
 * The run the console opens on is the newest, which during a run is the one
 * these scenarios are being executed by, so no run id has to be selected.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/scenarios/pikku-scenario-types.gen.js'

const SCENARIOS_PAGE = '/console/scenarios'

export const runsListedScenario = pikkuScenario<void, { runs: number }>({
  title: 'The scenarios page reads back the run it is being run by',
  description:
    'A run is history, so the console reads the store back: the newest run is a lens over the suite, saying how it went',
  tags: ['scenario', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'runsListedScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the scenarios page',
      'opensConsolePage',
      { path: SCENARIOS_PAGE, waitFor: { testId: 'scenario-run-band' } },
      { actor: actors.admin }
    )
    const listed = await scenario.then(
      'sees the run it is being run by',
      'seesTestId',
      { testId: 'feature-result-bar', atLeast: 1 },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees that run still going',
      'seesTestId',
      { testId: 'scenario-run-status-running' },
      { actor: actors.admin }
    )

    return { runs: listed.count }
  },
})

export const runReadsBackItsProseScenario = pikkuScenario<
  void,
  { opened: true }
>({
  title: 'A run reads back the scenarios it walked',
  description:
    'The timeline is the run as it was recorded, and opening a segment lands on that scenario in the document',
  tags: ['scenario', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'runReadsBackItsProseScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the scenarios page',
      'opensConsolePage',
      { path: SCENARIOS_PAGE, waitFor: { testId: 'scenario-run-timeline' } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the run as a timeline',
      'seesTestId',
      { testId: 'scenario-run-timeline' },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens a scenario from the timeline',
      'clicksTestId',
      { testId: 'scenario-run-segment-', prefix: true },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees that scenario read as prose',
      'seesTestId',
      { testId: 'scenario-section-', prefix: true, atLeast: 1 },
      { actor: actors.admin }
    )

    return { opened: true }
  },
})

export const scenarioRunsConsoleFeature = pikkuFeature({
  name: 'Scenario Runs Console Page',
  description:
    'The console reads back what past runs of this suite recorded — the scenarios they walked, the prose they walked it in, and the images and footage they left behind',
  tags: ['scenario-runs-console', 'console'],
  scenarios: [runsListedScenario, runReadsBackItsProseScenario],
})
