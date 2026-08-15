/**
 * The console's record of past runs.
 *
 * `pikku scenario run` files every invocation into a run store — the scenarios
 * it selected, the sentences they were made of, and the screenshots and footage
 * they produced — and the console reads that store back. These scenarios are
 * necessarily self-referential: the run they find in the list is the one they
 * are being executed by, which is exactly the claim worth proving. A store that
 * only fills in after the process exits would be no use to anyone watching a
 * suite go.
 *
 * The prose is asserted against the *snapshot*, not against today's source: a
 * scenario is code and code moves, and a run from last week has to keep
 * describing the suite that actually ran.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

const RUNS_PAGE = '/console/scenarios?view=runs'

export const runsListedScenario = pikkuScenario<void, { runs: number }>({
  title: 'The scenarios page lists the runs it has kept',
  description:
    'A run is history, so it outlives the process that produced it and reads back as a list',
  tags: ['scenario', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'runsListedScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the runs view of the scenarios page',
      'opensConsolePage',
      { path: RUNS_PAGE, waitFor: { testId: 'scenario-run-navigator' } },
      { actor: actors.admin }
    )
    const listed = await scenario.then(
      'sees the run it is being run by',
      'seesTestId',
      { testId: 'scenario-run-row-', prefix: true, atLeast: 1 },
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
  title: 'A run reads back the sentences it walked',
  description:
    'The ladder shown is the one snapshotted into the run, so history keeps describing the suite that ran',
  tags: ['scenario', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'runReadsBackItsProseScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the runs view of the scenarios page',
      'opensConsolePage',
      { path: RUNS_PAGE, waitFor: { testId: 'scenario-run-detail' } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the newest run opened',
      'seesTestId',
      { testId: 'scenario-run-detail' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees a scenario the run already finished',
      'seesTestId',
      { testId: 'scenario-run-result-', prefix: true, atLeast: 1 },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees that scenario as the sentences it walked',
      'seesTestId',
      { testId: 'scenario-run-steps', atLeast: 1 },
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
