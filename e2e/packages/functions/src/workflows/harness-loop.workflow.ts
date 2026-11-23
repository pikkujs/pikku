import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'
import type { FakeGateRun, Severity } from '../functions/harness.functions.js'

/**
 * One change through the harness: the agent builds, the gate checks, the
 * verdict applies `failOn`. A failure goes back to the agent as feedback, up to
 * three attempts, and the loop stops early when an attempt fails on exactly
 * the findings the previous one did (no progress). A gate that throws ends the run as `infra` and never
 * reaches the agent. Attempts are written out one by one so every step has a
 * fixed name the inspector can read.
 */
export const harnessLoopWorkflow = pikkuWorkflowFunc<
  { changeId: string; failOn: Severity; gateRuns: FakeGateRun[] },
  {
    status: 'done' | 'gave-up' | 'repeated' | 'infra'
    attempts: number
    feedbackHeard: string
    feedbackHistory: string[]
    failing: number
    notes: number
    infraError: string
  }
>({
  auth: false,
  expose: true,
  tags: ['harness'],
  func: async ({}, data, { workflow }) => {
    const built1 = await workflow.do(
      'Agent builds (attempt 1)',
      'harnessFakeAgent',
      {
        changeId: data.changeId,
        attempt: 1,
        feedback: '',
      }
    )
    let gate = await workflow.do('Gate checks (attempt 1)', 'harnessRunGate', {
      attempt: 1,
      runs: data.gateRuns,
    })
    if (gate.infra) {
      return {
        status: 'infra',
        attempts: 1,
        feedbackHeard: built1.heard,
        feedbackHistory: [built1.heard],
        failing: 0,
        notes: 0,
        infraError: gate.error,
      }
    }
    let verdict = await workflow.do('Verdict (attempt 1)', 'harnessVerdict', {
      findings: gate.findings,
      failOn: data.failOn,
      previous: [],
    })
    if (verdict.passed) {
      await workflow.do('Mark done (attempt 1)', 'harnessMarkDone', {
        changeId: data.changeId,
        attempts: 1,
      })
      return {
        status: 'done',
        attempts: 1,
        feedbackHeard: built1.heard,
        feedbackHistory: [built1.heard],
        failing: 0,
        notes: verdict.notes.length,
        infraError: '',
      }
    }

    const built2 = await workflow.do(
      'Agent fixes (attempt 2)',
      'harnessFakeAgent',
      {
        changeId: data.changeId,
        attempt: 2,
        feedback: verdict.feedback,
      }
    )
    gate = await workflow.do('Gate checks (attempt 2)', 'harnessRunGate', {
      attempt: 2,
      runs: data.gateRuns,
    })
    if (gate.infra) {
      return {
        status: 'infra',
        attempts: 2,
        feedbackHeard: built2.heard,
        feedbackHistory: [built1.heard, built2.heard],
        failing: 0,
        notes: 0,
        infraError: gate.error,
      }
    }
    verdict = await workflow.do('Verdict (attempt 2)', 'harnessVerdict', {
      findings: gate.findings,
      failOn: data.failOn,
      previous: verdict.failing,
    })
    if (verdict.passed) {
      await workflow.do('Mark done (attempt 2)', 'harnessMarkDone', {
        changeId: data.changeId,
        attempts: 2,
      })
      return {
        status: 'done',
        attempts: 2,
        feedbackHeard: built2.heard,
        feedbackHistory: [built1.heard, built2.heard],
        failing: 0,
        notes: verdict.notes.length,
        infraError: '',
      }
    }
    if (verdict.repeated) {
      return {
        status: 'repeated',
        attempts: 2,
        feedbackHeard: built2.heard,
        feedbackHistory: [built1.heard, built2.heard],
        failing: verdict.failing.length,
        notes: verdict.notes.length,
        infraError: '',
      }
    }

    const built3 = await workflow.do(
      'Agent fixes (attempt 3)',
      'harnessFakeAgent',
      {
        changeId: data.changeId,
        attempt: 3,
        feedback: verdict.feedback,
      }
    )
    gate = await workflow.do('Gate checks (attempt 3)', 'harnessRunGate', {
      attempt: 3,
      runs: data.gateRuns,
    })
    if (gate.infra) {
      return {
        status: 'infra',
        attempts: 3,
        feedbackHeard: built3.heard,
        feedbackHistory: [built1.heard, built2.heard, built3.heard],
        failing: 0,
        notes: 0,
        infraError: gate.error,
      }
    }
    verdict = await workflow.do('Verdict (attempt 3)', 'harnessVerdict', {
      findings: gate.findings,
      failOn: data.failOn,
      previous: verdict.failing,
    })
    if (verdict.passed) {
      await workflow.do('Mark done (attempt 3)', 'harnessMarkDone', {
        changeId: data.changeId,
        attempts: 3,
      })
      return {
        status: 'done',
        attempts: 3,
        feedbackHeard: built3.heard,
        feedbackHistory: [built1.heard, built2.heard, built3.heard],
        failing: 0,
        notes: verdict.notes.length,
        infraError: '',
      }
    }
    if (verdict.repeated) {
      return {
        status: 'repeated',
        attempts: 3,
        feedbackHeard: built3.heard,
        feedbackHistory: [built1.heard, built2.heard, built3.heard],
        failing: verdict.failing.length,
        notes: verdict.notes.length,
        infraError: '',
      }
    }
    return {
      status: 'gave-up',
      attempts: 3,
      feedbackHeard: built3.heard,
      feedbackHistory: [built1.heard, built2.heard, built3.heard],
      failing: verdict.failing.length,
      notes: verdict.notes.length,
      infraError: '',
    }
  },
})
