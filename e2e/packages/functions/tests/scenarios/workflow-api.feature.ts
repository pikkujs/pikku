/**
 * The workflow HTTP surface: DSL workflows, graph workflows, async start with
 * status polling, and the status SSE stream.
 *
 * A failed or cancelled run is an expected outcome here, not an error, so every
 * scenario reads the outcome off the run result rather than relying on a throw.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const SEQUENTIAL = 'dslSequentialWorkflow'

export const workflowDslSequentialScenario = pikkuScenario<
  void,
  { completed: true }
>({
  title: 'DSL sequential workflow completes with correct output',
  description: 'Each step feeds the next and the last one reports all three',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const run = await scenario.when('runs the workflow', 'runsWorkflow', {
      workflowName: SEQUENTIAL,
      input: { value: 5, name: 'Test' },
    })
    await scenario.then('expects it to complete', 'expectsWorkflowOutcome', {
      run,
      outcome: 'completed',
    })
    await scenario.then('expects the output', 'expectsWorkflowOutput', {
      run,
      values: { doubled: 10, message: 'Hello, Test!', notified: true },
    })
    return { completed: true }
  },
})

export const workflowDslParallelScenario = pikkuScenario<
  void,
  { completed: true }
>({
  title: 'DSL parallel workflow processes all items',
  description: 'Every item is processed and the totals are summed',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const run = await scenario.when('runs the workflow', 'runsWorkflow', {
      workflowName: 'dslParallelWorkflow',
      input: { values: [1, 2, 3, 4, 5] },
    })
    await scenario.then('expects it to complete', 'expectsWorkflowOutcome', {
      run,
      outcome: 'completed',
    })
    await scenario.then('expects the total', 'expectsWorkflowOutput', {
      run,
      values: { total: 30 },
    })
    return { completed: true }
  },
})

export const workflowDslBranchingPremiumScenario = pikkuScenario<
  void,
  { completed: true }
>({
  title: 'DSL branching workflow takes premium path',
  description: 'A high score routes to the premium branch',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const run = await scenario.when('runs the workflow', 'runsWorkflow', {
      workflowName: 'dslBranchingWorkflow',
      input: { score: 85, name: 'Premium' },
    })
    await scenario.then('expects it to complete', 'expectsWorkflowOutcome', {
      run,
      outcome: 'completed',
    })
    await scenario.then('expects the premium path', 'expectsWorkflowOutput', {
      run,
      values: { path: 'premium', message: 'Congratulations, Premium!' },
    })
    return { completed: true }
  },
})

export const workflowDslBranchingStandardScenario = pikkuScenario<
  void,
  { completed: true }
>({
  title: 'DSL branching workflow takes standard path',
  description: 'A low score routes to the standard branch',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const run = await scenario.when('runs the workflow', 'runsWorkflow', {
      workflowName: 'dslBranchingWorkflow',
      input: { score: 50, name: 'Standard' },
    })
    await scenario.then('expects it to complete', 'expectsWorkflowOutcome', {
      run,
      outcome: 'completed',
    })
    await scenario.then('expects the standard path', 'expectsWorkflowOutput', {
      run,
      values: { path: 'standard', message: 'Thank you, Standard!' },
    })
    return { completed: true }
  },
})

export const workflowDslRetryHappyScenario = pikkuScenario<
  void,
  { completed: true }
>({
  title: 'DSL retry happy workflow succeeds on retry',
  description: 'A step that fails once still produces its result',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const run = await scenario.when('runs the workflow', 'runsWorkflow', {
      workflowName: 'dslRetryHappyWorkflow',
      input: { value: 7 },
    })
    await scenario.then('expects it to complete', 'expectsWorkflowOutcome', {
      run,
      outcome: 'completed',
    })
    await scenario.then('expects the result', 'expectsWorkflowOutput', {
      run,
      values: { result: 21 },
    })
    return { completed: true }
  },
})

export const workflowDslRetryUnhappyScenario = pikkuScenario<
  void,
  { failed: true }
>({
  title: 'DSL retry unhappy workflow fails after retries exhausted',
  description: 'A step that never succeeds fails the whole run',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const run = await scenario.when('runs the workflow', 'runsWorkflow', {
      workflowName: 'dslRetryUnhappyWorkflow',
      input: { value: 7 },
    })
    await scenario.then('expects it to fail', 'expectsWorkflowOutcome', {
      run,
      outcome: 'failed',
    })
    return { failed: true }
  },
})

export const workflowDslCancellationCancelsScenario = pikkuScenario<
  void,
  { cancelled: true }
>({
  title: 'DSL cancellation workflow cancels when requested',
  description: 'The run stops at the cancellation point',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const run = await scenario.when('runs the workflow', 'runsWorkflow', {
      workflowName: 'dslCancellationWorkflow',
      input: { shouldCancel: true, value: 5 },
    })
    await scenario.then('expects it to cancel', 'expectsWorkflowOutcome', {
      run,
      outcome: 'cancelled',
    })
    return { cancelled: true }
  },
})

export const workflowDslCancellationCompletesScenario = pikkuScenario<
  void,
  { completed: true }
>({
  title: 'DSL cancellation workflow completes when not cancelled',
  description: 'Without the cancellation flag the run finishes normally',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const run = await scenario.when('runs the workflow', 'runsWorkflow', {
      workflowName: 'dslCancellationWorkflow',
      input: { shouldCancel: false, value: 5 },
    })
    await scenario.then('expects it to complete', 'expectsWorkflowOutcome', {
      run,
      outcome: 'completed',
    })
    await scenario.then('expects the result', 'expectsWorkflowOutput', {
      run,
      values: { result: 10 },
    })
    return { completed: true }
  },
})

export const workflowComplexInlineScenario = pikkuScenario<
  void,
  { completed: true }
>({
  title: 'Complex inline workflow processes items with inline steps',
  description: 'Inline steps filter the items down to the qualifying ones',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const run = await scenario.when('runs the workflow', 'runsWorkflow', {
      workflowName: 'complexInlineWorkflow',
      input: { items: [2, 3, 6, 8] },
    })
    await scenario.then('expects it to complete', 'expectsWorkflowOutcome', {
      run,
      outcome: 'completed',
    })
    await scenario.then('expects the count', 'expectsWorkflowOutput', {
      run,
      values: { count: 2 },
    })
    return { completed: true }
  },
})

export const workflowGraphLinearScenario = pikkuScenario<
  void,
  { completed: true }
>({
  title: 'Graph linear workflow completes all nodes',
  description: 'A graph with one path visits every node',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const run = await scenario.when('runs the graph', 'runsWorkflow', {
      workflowName: 'graphLinearWorkflow',
      input: { value: 5, name: 'GraphTest' },
    })
    await scenario.then('expects it to complete', 'expectsWorkflowOutcome', {
      run,
      outcome: 'completed',
    })
    return { completed: true }
  },
})

export const workflowGraphBranchingPassScenario = pikkuScenario<
  void,
  { completed: true }
>({
  title: 'Graph branching workflow takes pass path',
  description: 'A passing score reaches a terminal node',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const run = await scenario.when('runs the graph', 'runsWorkflow', {
      workflowName: 'graphBranchingWorkflow',
      input: { score: 85, name: 'Passing' },
    })
    await scenario.then('expects it to complete', 'expectsWorkflowOutcome', {
      run,
      outcome: 'completed',
    })
    return { completed: true }
  },
})

export const workflowGraphBranchingFailScenario = pikkuScenario<
  void,
  { completed: true }
>({
  title: 'Graph branching workflow takes fail path',
  description: 'A failing score also reaches a terminal node',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const run = await scenario.when('runs the graph', 'runsWorkflow', {
      workflowName: 'graphBranchingWorkflow',
      input: { score: 50, name: 'Failing' },
    })
    await scenario.then('expects it to complete', 'expectsWorkflowOutcome', {
      run,
      outcome: 'completed',
    })
    return { completed: true }
  },
})

export const workflowGraphParallelScenario = pikkuScenario<
  void,
  { completed: true }
>({
  title: 'Graph parallel workflow runs nodes in parallel',
  description: 'Parallel nodes all complete before the run does',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const run = await scenario.when('runs the graph', 'runsWorkflow', {
      workflowName: 'graphParallelWorkflow',
      input: { value: 5, name: 'Parallel' },
    })
    await scenario.then('expects it to complete', 'expectsWorkflowOutcome', {
      run,
      outcome: 'completed',
    })
    return { completed: true }
  },
})

export const workflowAsyncStartAndPollScenario = pikkuScenario<
  void,
  { completed: true }
>({
  title: 'Async workflow start and status polling',
  description: 'Starting answers with a run id whose status reaches completed',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const started = await scenario.when(
      'starts the workflow',
      'startsWorkflow',
      {
        workflowName: SEQUENTIAL,
        input: { value: 5, name: 'Async' },
      }
    )
    await scenario.then('expects a run id', 'expectsRunId', { run: started })
    const run = await scenario.when(
      'polls until it completes',
      'awaitsWorkflowRun',
      { run: started }
    )
    await scenario.then('expects it to complete', 'expectsWorkflowOutcome', {
      run,
      outcome: 'completed',
    })
    return { completed: true }
  },
})

export const workflowStatusStreamScenario = pikkuScenario<
  void,
  { streamed: true }
>({
  title: 'Workflow status stream delivers events until completion',
  description: 'The SSE stream carries at least one event and ends completed',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario }) => {
    const started = await scenario.given(
      'starts the workflow',
      'startsWorkflow',
      { workflowName: SEQUENTIAL, input: { value: 5, name: 'Stream' } }
    )
    await scenario.then('expects a run id', 'expectsRunId', { run: started })
    const stream = await scenario.when(
      'streams the run status',
      'drainsWorkflowStatusStream',
      { run: started }
    )
    await scenario.then('expects the stream', 'expectsWorkflowStream', {
      stream,
      minEvents: 1,
      lastStatus: 'completed',
    })
    return { streamed: true }
  },
})

export const workflowApiFeature = pikkuFeature({
  name: 'Workflow API',
  description: 'DSL and graph workflows over HTTP, with polling and streaming',
  tags: ['workflow'],
  scenarios: [
    workflowDslSequentialScenario,
    workflowDslParallelScenario,
    workflowDslBranchingPremiumScenario,
    workflowDslBranchingStandardScenario,
    workflowDslRetryHappyScenario,
    workflowDslRetryUnhappyScenario,
    workflowDslCancellationCancelsScenario,
    workflowDslCancellationCompletesScenario,
    workflowComplexInlineScenario,
    workflowGraphLinearScenario,
    workflowGraphBranchingPassScenario,
    workflowGraphBranchingFailScenario,
    workflowGraphParallelScenario,
    workflowAsyncStartAndPollScenario,
    workflowStatusStreamScenario,
  ],
})
