/**
 * The workflow canvas in the console, read against runs this suite started
 * itself.
 *
 * Every node reports its run status as `data-node-status`, so an assertion
 * names the status the engine recorded. The cucumber version read the node's
 * computed background colour and classified the rgb channels — which asserted
 * the palette rather than the run, and would have gone green on any three
 * greenish pixels.
 *
 * A node is addressed by its step name — `workflow.do('Double value', ...)` —
 * which is the key the engine records step state under, so the canvas and the
 * run history are being read through the same identity.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const node = (id: string, status: string) => ({
  testId: 'workflow-node',
  where: { 'data-node-id': id, 'data-node-status': status },
})

export const workflowUiCompletedRunScenario = pikkuScenario<
  void,
  { shown: true }
>({
  title: 'A completed run paints every step as succeeded',
  description:
    'The canvas colours each node from the run the console is showing, not from the workflow definition',
  tags: ['scenario', 'workflow-ui', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'workflowUiCompletedRunScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    const started = await scenario.given(
      'starts the workflow',
      'startsWorkflow',
      {
        workflowName: 'dslSequentialWorkflow',
        input: { value: 5, name: 'UIGreenTest' },
      }
    )
    const run = await scenario.given(
      'waits for it to finish',
      'awaitsWorkflowRun',
      {
        run: started,
      }
    )
    await scenario.then(
      'expects it to have completed',
      'expectsWorkflowOutcome',
      {
        run,
        outcome: 'completed',
      }
    )

    await scenario.when(
      'opens the run on the canvas',
      'opensWorkflowRun',
      { workflowName: 'dslSequentialWorkflow', runId: run.runId },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the run listed as completed',
      'seesTestId',
      {
        testId: 'run-row',
        where: {
          'data-run-id': run.runId ?? '',
          'data-run-status': 'completed',
        },
      },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the first step succeeded',
      'seesTestId',
      node('Double value', 'succeeded'),
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the second step succeeded',
      'seesTestId',
      node('Format message', 'succeeded'),
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the last step succeeded',
      'seesTestId',
      node('Send notification', 'succeeded'),
      { actor: actors.admin }
    )

    return { shown: true }
  },
})

export const workflowUiFailedRunScenario = pikkuScenario<void, { shown: true }>(
  {
    title: 'A failed run paints the step that failed',
    description:
      'The node that threw is reported as failed, so the canvas points at the cause rather than only the outcome',
    tags: ['scenario', 'workflow-ui', 'console'],
    func: async (_services, _data, { scenario, actors }) => {
      if (!actors?.admin) {
        throw new Error(
          'workflowUiFailedRunScenario needs the admin actor — run via `pikku scenario run <environment>`'
        )
      }

      const started = await scenario.given(
        'starts the workflow',
        'startsWorkflow',
        {
          workflowName: 'dslRetryUnhappyWorkflow',
          input: { value: 7 },
        }
      )
      const run = await scenario.given(
        'waits for it to finish',
        'awaitsWorkflowRun',
        {
          run: started,
        }
      )
      await scenario.then(
        'expects it to have failed',
        'expectsWorkflowOutcome',
        {
          run,
          outcome: 'failed',
        }
      )

      await scenario.when(
        'opens the run on the canvas',
        'opensWorkflowRun',
        { workflowName: 'dslRetryUnhappyWorkflow', runId: run.runId },
        { actor: actors.admin }
      )
      await scenario.then(
        'sees the run listed as failed',
        'seesTestId',
        {
          testId: 'run-row',
          where: {
            'data-run-id': run.runId ?? '',
            'data-run-status': 'failed',
          },
        },
        { actor: actors.admin }
      )
      await scenario.then(
        'sees the failing step reported as failed',
        'seesTestId',
        node('Always fails', 'failed'),
        { actor: actors.admin }
      )

      return { shown: true }
    },
  }
)

export const workflowUiCancelledRunScenario = pikkuScenario<
  void,
  { shown: true }
>({
  title: 'A cancelled run is listed as cancelled',
  description:
    'Cancellation is its own outcome, distinct from a failure, and the run list has to say so',
  tags: ['scenario', 'workflow-ui', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'workflowUiCancelledRunScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    const started = await scenario.given(
      'starts the workflow',
      'startsWorkflow',
      {
        workflowName: 'dslCancellationWorkflow',
        input: { shouldCancel: true, value: 5 },
      }
    )
    const run = await scenario.given(
      'waits for it to finish',
      'awaitsWorkflowRun',
      {
        run: started,
      }
    )
    await scenario.then(
      'expects it to have cancelled',
      'expectsWorkflowOutcome',
      {
        run,
        outcome: 'cancelled',
      }
    )

    await scenario.when(
      'opens the run on the canvas',
      'opensWorkflowRun',
      { workflowName: 'dslCancellationWorkflow', runId: run.runId },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the run listed as cancelled',
      'seesTestId',
      {
        testId: 'run-row',
        where: {
          'data-run-id': run.runId ?? '',
          'data-run-status': 'cancelled',
        },
      },
      { actor: actors.admin }
    )

    return { shown: true }
  },
})

/**
 * Scrubbing rebuilds the canvas from the run history up to the chosen step, so
 * a step that had not happened yet at that point must lose its status again.
 * That backwards direction is the whole feature — a canvas that only ever adds
 * status would pass every forwards assertion and still be wrong.
 */
export const workflowUiTimelineScrubScenario = pikkuScenario<
  void,
  { scrubbed: true }
>({
  title: 'Scrubbing the timeline time-travels the canvas',
  description:
    'The canvas reflects the run as it stood at the scrubbed step, and following live restores the end state',
  tags: ['scenario', 'workflow-ui', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'workflowUiTimelineScrubScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    const started = await scenario.given(
      'starts the workflow',
      'startsWorkflow',
      {
        workflowName: 'dslSequentialWorkflow',
        input: { value: 5, name: 'UITimeTravel' },
      }
    )
    const run = await scenario.given(
      'waits for it to finish',
      'awaitsWorkflowRun',
      {
        run: started,
      }
    )
    await scenario.then(
      'expects it to have completed',
      'expectsWorkflowOutcome',
      {
        run,
        outcome: 'completed',
      }
    )

    await scenario.when(
      'opens the run on the canvas',
      'opensWorkflowRun',
      { workflowName: 'dslSequentialWorkflow', runId: run.runId },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the timeline',
      'seesTestId',
      { testId: 'workflow-timeline' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the last step succeeded',
      'seesTestId',
      node('Send notification', 'succeeded'),
      { actor: actors.admin }
    )

    await scenario.when(
      'scrubs back to the first step',
      'clicksTestId',
      { testId: 'timeline-step', where: { 'data-step': 'Double value' } },
      { actor: actors.admin }
    )
    await scenario.then(
      'still sees the first step succeeded',
      'seesTestId',
      node('Double value', 'succeeded'),
      { actor: actors.admin }
    )
    await scenario.then(
      'no longer sees the last step succeeded',
      'doesNotSeeTestId',
      {
        testId: 'workflow-node',
        where: {
          'data-node-id': 'Send notification',
          'data-node-status': 'succeeded',
        },
      },
      { actor: actors.admin }
    )

    await scenario.when(
      'follows the live run again',
      'clicksTestId',
      { testId: 'timeline-follow-live' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the last step succeeded again',
      'seesTestId',
      node('Send notification', 'succeeded'),
      { actor: actors.admin }
    )

    return { scrubbed: true }
  },
})

export const workflowUiFeature = pikkuFeature({
  name: 'Workflow Canvas',
  description: 'Reading a workflow run on the console canvas',
  tags: ['workflow-ui', 'console'],
  scenarios: [
    workflowUiCompletedRunScenario,
    workflowUiFailedRunScenario,
    workflowUiCancelledRunScenario,
    workflowUiTimelineScrubScenario,
  ],
})
