/**
 * The harness loop with a fake agent and a fake gate: the gate's findings for
 * each attempt come from the run's input, so nothing here calls a model, the
 * network or git.
 *
 * Every run completes; how the change ended (`done`, `gave-up`, `repeated`,
 * `infra`) is the workflow's output.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const HARNESS = 'harnessLoopWorkflow'

const anyType = {
  file: 'src/todo.ts',
  line: 12,
  severity: 'high',
  rule: 'no-explicit-any',
  message: 'Unexpected any',
}

const unusedImport = {
  file: 'src/todo.ts',
  line: 3,
  severity: 'high',
  rule: 'no-unused-vars',
  message: "'z' is defined but never used",
}

const missingTest = {
  file: 'src/todo.ts',
  severity: 'critical',
  message: 'No test covers createTodo',
}

const anyTypeFeedback =
  'The gates found 1 problem to fix:\n' +
  '- [high] src/todo.ts:12 (no-explicit-any) Unexpected any'

const bothFeedback =
  'The gates found 2 problems to fix:\n' +
  '- [high] src/todo.ts:12 (no-explicit-any) Unexpected any\n' +
  "- [high] src/todo.ts:3 (no-unused-vars) 'z' is defined but never used"

export const harnessPassesOnRetryScenario = pikkuScenario<
  void,
  { completed: true }
>({
  title: 'A failed gate is fed back and the change passes on attempt 2',
  description:
    'The first gate run finds a problem at failOn, the agent hears it, and the second gate run is clean',
  tags: ['scenario', 'harness'],
  func: async (_services, _data, { scenario }) => {
    const run = await scenario.when('runs the harness', 'runsWorkflow', {
      workflowName: HARNESS,
      input: {
        changeId: 'c-retry',
        failOn: 'high',
        gateRuns: [{ findings: [anyType] }, { findings: [] }],
      },
    })
    await scenario.then(
      'expects the run to complete',
      'expectsWorkflowOutcome',
      {
        run,
        outcome: 'completed',
      }
    )
    await scenario.then(
      'expects done on attempt 2, with the findings heard by the agent',
      'expectsWorkflowOutput',
      {
        run,
        values: {
          status: 'done',
          attempts: 2,
          feedbackHeard: anyTypeFeedback,
          feedbackHistory: ['', anyTypeFeedback],
          failing: 0,
        },
      }
    )
    return { completed: true }
  },
})

export const harnessGivesUpScenario = pikkuScenario<void, { completed: true }>({
  title: 'A change that never passes gives up after 3 attempts',
  description:
    'Each gate run finds a different problem, so nothing repeats and the loop runs out of attempts',
  tags: ['scenario', 'harness'],
  func: async (_services, _data, { scenario }) => {
    const run = await scenario.when('runs the harness', 'runsWorkflow', {
      workflowName: HARNESS,
      input: {
        changeId: 'c-give-up',
        failOn: 'high',
        gateRuns: [
          { findings: [anyType] },
          { findings: [unusedImport] },
          { findings: [missingTest] },
        ],
      },
    })
    await scenario.then(
      'expects the run to complete',
      'expectsWorkflowOutcome',
      {
        run,
        outcome: 'completed',
      }
    )
    await scenario.then('expects gave-up after 3', 'expectsWorkflowOutput', {
      run,
      values: { status: 'gave-up', attempts: 3, failing: 1 },
    })
    return { completed: true }
  },
})

export const harnessRepeatedFindingScenario = pikkuScenario<
  void,
  { completed: true }
>({
  title: 'The same failing findings twice stop the loop early',
  description:
    'Attempt 2 fails on exactly the findings attempt 1 did, so no progress was made and a third attempt is not made',
  tags: ['scenario', 'harness'],
  func: async (_services, _data, { scenario }) => {
    const run = await scenario.when('runs the harness', 'runsWorkflow', {
      workflowName: HARNESS,
      input: {
        changeId: 'c-repeat',
        failOn: 'high',
        gateRuns: [
          { findings: [anyType] },
          { findings: [anyType] },
          { findings: [] },
        ],
      },
    })
    await scenario.then(
      'expects the run to complete',
      'expectsWorkflowOutcome',
      {
        run,
        outcome: 'completed',
      }
    )
    await scenario.then('expects repeated after 2', 'expectsWorkflowOutput', {
      run,
      values: { status: 'repeated', attempts: 2, failing: 1 },
    })
    return { completed: true }
  },
})

export const harnessPartialRepeatScenario = pikkuScenario<
  void,
  { completed: true }
>({
  title:
    'A finding that repeats beside one that was fixed does not stop the loop',
  description:
    'Attempt 2 fixes one of two findings, so it made progress: attempt 3 runs, hears the one left, and passes',
  tags: ['scenario', 'harness'],
  func: async (_services, _data, { scenario }) => {
    const run = await scenario.when('runs the harness', 'runsWorkflow', {
      workflowName: HARNESS,
      input: {
        changeId: 'c-progress',
        failOn: 'high',
        gateRuns: [
          { findings: [anyType, unusedImport] },
          { findings: [anyType] },
          { findings: [] },
        ],
      },
    })
    await scenario.then(
      'expects the run to complete',
      'expectsWorkflowOutcome',
      {
        run,
        outcome: 'completed',
      }
    )
    await scenario.then(
      "expects done on attempt 3, with each attempt's feedback",
      'expectsWorkflowOutput',
      {
        run,
        values: {
          status: 'done',
          attempts: 3,
          feedbackHeard: anyTypeFeedback,
          feedbackHistory: ['', bothFeedback, anyTypeFeedback],
        },
      }
    )
    return { completed: true }
  },
})

export const harnessGateThrowsScenario = pikkuScenario<
  void,
  { completed: true }
>({
  title: 'A gate that throws is infra and never reaches the agent',
  description:
    'The second gate run throws: the run ends as infra, the agent is not called again, and the last thing it heard is the first finding, not the error',
  tags: ['scenario', 'harness'],
  func: async (_services, _data, { scenario }) => {
    const run = await scenario.when('runs the harness', 'runsWorkflow', {
      workflowName: HARNESS,
      input: {
        changeId: 'c-infra',
        failOn: 'high',
        gateRuns: [
          { findings: [anyType] },
          { throws: 'opengrep: binary not found' },
          { findings: [] },
        ],
      },
    })
    await scenario.then(
      'expects the run to complete',
      'expectsWorkflowOutcome',
      {
        run,
        outcome: 'completed',
      }
    )
    await scenario.then(
      'expects infra, with the error kept from the agent',
      'expectsWorkflowOutput',
      {
        run,
        values: {
          status: 'infra',
          attempts: 2,
          feedbackHeard: anyTypeFeedback,
          feedbackHistory: ['', anyTypeFeedback],
          infraError: 'opengrep: binary not found',
        },
      }
    )
    return { completed: true }
  },
})

export const harnessNotesScenario = pikkuScenario<void, { completed: true }>({
  title: 'Findings below failOn are notes and the change passes',
  description:
    'A low and a medium finding under failOn high pass on the first attempt and are not fed back',
  tags: ['scenario', 'harness'],
  func: async (_services, _data, { scenario }) => {
    const run = await scenario.when('runs the harness', 'runsWorkflow', {
      workflowName: HARNESS,
      input: {
        changeId: 'c-notes',
        failOn: 'high',
        gateRuns: [
          {
            findings: [
              { severity: 'low', message: 'Prefer const' },
              {
                file: 'src/todo.ts',
                line: 40,
                severity: 'medium',
                message: 'Function is long',
              },
            ],
          },
        ],
      },
    })
    await scenario.then(
      'expects the run to complete',
      'expectsWorkflowOutcome',
      {
        run,
        outcome: 'completed',
      }
    )
    await scenario.then('expects done with 2 notes', 'expectsWorkflowOutput', {
      run,
      values: {
        status: 'done',
        attempts: 1,
        notes: 2,
        failing: 0,
        feedbackHeard: '',
      },
    })
    return { completed: true }
  },
})

export const harnessFeature = pikkuFeature({
  name: 'Harness loop',
  description:
    'Agent, gate and verdict with feedback, retries, early stop on a repeated finding, infra and notes',
  tags: ['harness'],
  scenarios: [
    harnessPassesOnRetryScenario,
    harnessGivesUpScenario,
    harnessRepeatedFindingScenario,
    harnessPartialRepeatScenario,
    harnessGateThrowsScenario,
    harnessNotesScenario,
  ],
})
