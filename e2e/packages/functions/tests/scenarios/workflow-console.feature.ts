/**
 * The console's workflow-run readers, exercised against runs this suite creates
 * itself: a run is executed over HTTP, then read back through the console RPCs
 * the Runs page uses.
 *
 * Each scenario runs its own workflow with a distinguishing `name`, because the
 * runner is serial with no state reset and a shared run would make one
 * scenario's deletion another's flake.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const SEQUENTIAL = 'dslSequentialWorkflow'

export const workflowConsoleListsRunsScenario = pikkuScenario<
  void,
  { listed: true }
>({
  title: 'Console lists workflow runs after execution',
  description: 'The runs reader answers with a collection',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario, actors }) => {
    const run = await scenario.given('runs a workflow', 'runsWorkflow', {
      workflowName: SEQUENTIAL,
      input: { value: 5, name: 'Console' },
    })
    await scenario.then('sees it complete', 'expectsWorkflowOutcome', {
      run,
      outcome: 'completed',
    })
    const call = await scenario.when(
      'the admin lists the runs',
      'invokesRpcRaw',
      { rpcName: 'console:getWorkflowRuns', data: {} },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees a collection of runs',
      'expectsRpcCollection',
      { call },
      { actor: actors.admin }
    )
    return { listed: true }
  },
})

export const workflowConsoleReadsRunDetailsScenario = pikkuScenario<
  void,
  { read: true }
>({
  title: 'Console gets workflow run details',
  description: 'The run reader answers with a record identifying the run',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario, actors }) => {
    const started = await scenario.given('runs a workflow', 'startsWorkflow', {
      workflowName: SEQUENTIAL,
      input: { value: 5, name: 'Detail' },
    })
    const run = await scenario.given(
      'waits for the run to finish',
      'awaitsWorkflowRun',
      { run: started }
    )
    await scenario.then('sees it complete', 'expectsWorkflowOutcome', {
      run,
      outcome: 'completed',
      hasRunId: true,
    })
    const call = await scenario.when(
      'the admin reads the run',
      'invokesRpcRaw',
      { rpcName: 'console:getWorkflowRun', data: { runId: run.runId } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the run details',
      'expectsRpcRecord',
      { call, anyOf: ['id', 'runId'] },
      { actor: actors.admin }
    )
    return { read: true }
  },
})

export const workflowConsoleReadsRunStepsScenario = pikkuScenario<
  void,
  { read: true }
>({
  title: 'Console gets workflow run steps',
  description: 'The steps reader answers with a collection',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario, actors }) => {
    const started = await scenario.given('runs a workflow', 'startsWorkflow', {
      workflowName: SEQUENTIAL,
      input: { value: 5, name: 'Steps' },
    })
    const run = await scenario.given(
      'waits for the run to finish',
      'awaitsWorkflowRun',
      { run: started }
    )
    await scenario.then('sees it complete', 'expectsWorkflowOutcome', {
      run,
      outcome: 'completed',
      hasRunId: true,
    })
    const call = await scenario.when(
      'the admin reads the run steps',
      'invokesRpcRaw',
      { rpcName: 'console:getWorkflowRunSteps', data: { runId: run.runId } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees a collection of steps',
      'expectsRpcCollection',
      { call },
      { actor: actors.admin }
    )
    return { read: true }
  },
})

export const workflowConsoleReadsRunHistoryScenario = pikkuScenario<
  void,
  { read: true }
>({
  title: 'Console gets workflow run history',
  description: 'The history reader answers with a collection',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario, actors }) => {
    const started = await scenario.given(
      'runs a retrying workflow',
      'startsWorkflow',
      {
        workflowName: 'dslRetryHappyWorkflow',
        input: { value: 7 },
      }
    )
    const run = await scenario.given(
      'waits for the run to finish',
      'awaitsWorkflowRun',
      { run: started }
    )
    await scenario.then('sees it complete', 'expectsWorkflowOutcome', {
      run,
      outcome: 'completed',
      hasRunId: true,
    })
    const call = await scenario.when(
      'the admin reads the run history',
      'invokesRpcRaw',
      { rpcName: 'console:getWorkflowRunHistory', data: { runId: run.runId } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees a collection of history entries',
      'expectsRpcCollection',
      { call },
      { actor: actors.admin }
    )
    return { read: true }
  },
})

export const workflowConsoleReadsRunNamesScenario = pikkuScenario<
  void,
  { read: true }
>({
  title: 'Console gets distinct workflow names',
  description: 'The names reader answers with a non-empty collection',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario, actors }) => {
    const run = await scenario.given('runs a workflow', 'runsWorkflow', {
      workflowName: SEQUENTIAL,
      input: { value: 5, name: 'Names' },
    })
    await scenario.then('sees it complete', 'expectsWorkflowOutcome', {
      run,
      outcome: 'completed',
    })
    const call = await scenario.when(
      'the admin reads the workflow names',
      'invokesRpcRaw',
      { rpcName: 'console:getWorkflowRunNames', data: {} },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees at least one name',
      'expectsRpcCollection',
      { call, minLength: 1 },
      { actor: actors.admin }
    )
    return { read: true }
  },
})

export const workflowConsoleDeletesRunScenario = pikkuScenario<
  void,
  { deleted: true }
>({
  title: 'Console deletes a workflow run',
  description: 'The delete RPC accepts a run this scenario created',
  tags: ['scenario', 'workflow'],
  func: async (_services, _data, { scenario, actors }) => {
    const started = await scenario.given('runs a workflow', 'startsWorkflow', {
      workflowName: SEQUENTIAL,
      input: { value: 5, name: 'Delete' },
    })
    const run = await scenario.given(
      'waits for the run to finish',
      'awaitsWorkflowRun',
      { run: started }
    )
    await scenario.then('sees it complete', 'expectsWorkflowOutcome', {
      run,
      outcome: 'completed',
      hasRunId: true,
    })
    const call = await scenario.when(
      'the admin deletes the run',
      'invokesRpcRaw',
      { rpcName: 'console:deleteWorkflowRun', data: { runId: run.runId } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees it accepted',
      'expectsRpcResponse',
      { call, status: 200 },
      { actor: actors.admin }
    )
    return { deleted: true }
  },
})

export const workflowConsoleFeature = pikkuFeature({
  name: 'Workflow console RPCs',
  description: "The console's workflow-run readers, against runs it creates",
  tags: ['workflow'],
  scenarios: [
    workflowConsoleListsRunsScenario,
    workflowConsoleReadsRunDetailsScenario,
    workflowConsoleReadsRunStepsScenario,
    workflowConsoleReadsRunHistoryScenario,
    workflowConsoleReadsRunNamesScenario,
    workflowConsoleDeletesRunScenario,
  ],
})
