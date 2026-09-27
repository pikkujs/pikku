/**
 * The console's record of past runs.
 *
 * `pikku scenario run` files every invocation into a run store — the scenarios
 * it selected, the sentences they were made of, and the screenshots and footage
 * they produced — and the console reads that store back. These scenarios are
 * necessarily self-referential: the run they find is the one they are being
 * executed by, which is exactly the claim worth proving. A store that only
 * filled in after the process exited would be no use to anyone watching a suite
 * go.
 *
 * A run is not its own screen: the scenarios page is the suite, and a run is a
 * lens laid over it. Opening the page with no run named reads the newest one,
 * so the band, the timeline and the marks beside each section are all claims
 * about the run that is producing this very assertion. The prose asserted is
 * the *snapshot* the run kept, not today's source: a scenario is code and code
 * moves, and a run from last week has to keep describing the suite that ran.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/scenarios/pikku-scenario-types.gen.js'

const SCENARIOS_PAGE = '/console/scenarios'

export const runsListedScenario = pikkuScenario<void, { runs: number }>({
  title: 'The scenarios page lists the runs it has kept',
  description:
    'A run is history, so it outlives the process that produced it and reads back as something to pick',
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
    await scenario.when(
      'opens the run lens',
      'clicksTestId',
      { testId: 'scenario-run-filter' },
      { actor: actors.admin }
    )
    // Two, because reading the suite as written is one of the choices: a page
    // offering only that has kept no runs at all.
    const listed = await scenario.then(
      'sees the run it is being run by offered beside the suite as written',
      'seesTestId',
      { testId: 'scenario-run-filter-option-', prefix: true, atLeast: 2 },
      { actor: actors.admin }
    )

    return { runs: listed.count - 1 }
  },
})

export const runReadsBackItsProseScenario = pikkuScenario<
  void,
  { opened: true }
>({
  title: 'A run reads back the sentences it walked',
  description:
    'The ladder marked is the one snapshotted into the run, so history keeps describing the suite that ran',
  tags: ['scenario', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'runReadsBackItsProseScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the scenarios page, which reads the newest run',
      'opensConsolePage',
      { path: SCENARIOS_PAGE, waitFor: { testId: 'scenario-run-band' } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees that run still going',
      'seesTestId',
      { testId: 'scenario-run-status-running' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the scenarios it reached laid out in order',
      'seesTestId',
      { testId: 'scenario-run-timeline' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees a scenario the run is in the middle of',
      'seesTestId',
      { testId: 'scenario-status-mark-running' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees that scenario as the sentences it walked',
      'seesTestId',
      { testId: 'ladder-step-', prefix: true, atLeast: 1 },
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
