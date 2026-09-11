/**
 * The run controls that sit on the workflow screen itself, beside the graph.
 *
 * Running a workflow is what the screen is for, but the form that starts a run
 * renders in the details panel — which the reader can close. The button then
 * looked dead: it set the run state and nothing on screen moved, because
 * activating a panel id that is no longer open does nothing.
 *
 * Closing the panel before clicking is therefore the whole point of this
 * feature. An assertion that clicks the control with the panel already open
 * passes whether or not the control re-opens it.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const WORKFLOW_PAGE = '/console/workflow?id=graphLinearWorkflow'

export const workflowControlsReopenScenario = pikkuScenario<
  void,
  { reopened: true }
>({
  title: 'Starting a run re-opens the panel it renders into',
  description:
    'An admin who closed the details panel can still start a run from the graph screen',
  tags: ['scenario', 'workflow-controls', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'workflowControlsReopenScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the workflow',
      'opensConsolePage',
      {
        path: WORKFLOW_PAGE,
        waitFor: { testId: 'workflow-controls-new-run' },
      },
      { actor: actors.admin }
    )

    await scenario.when(
      'closes the details panel',
      'clicksTestId',
      { testId: 'console-detail-panel-close' },
      { actor: actors.admin }
    )
    await scenario.then(
      'no longer sees the panel',
      'doesNotSeeTestId',
      { testId: 'console-detail-panel-close' },
      { actor: actors.admin }
    )

    await scenario.when(
      'starts a new run from the graph screen',
      'clicksTestId',
      { testId: 'workflow-controls-new-run' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the run form, because the panel re-opened',
      'seesTestId',
      { testId: 'workflow-new-run-form' },
      { actor: actors.admin }
    )

    return { reopened: true }
  },
})

export const workflowControlsFeature = pikkuFeature({
  name: 'Workflow Run Controls',
  description: 'Starting a run from the workflow screen itself',
  tags: ['workflow-controls', 'console'],
  scenarios: [workflowControlsReopenScenario],
})
