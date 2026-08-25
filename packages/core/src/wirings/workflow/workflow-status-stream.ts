import type { CoreUserSession } from '../../types/core.types.js'
import type { PikkuChannel } from '../channel/channel.types.js'
import { assertWorkflowRunOwner } from './workflow-run-ownership.js'
import type { WorkflowRunService, WorkflowStatus } from './workflow.types.js'

/**
 * The status stream behind the scaffolded workflow SSE routes.
 *
 * Two routes share it, and they differ by one thing: whether the caller is
 * trusted with what the run produced. A user-facing frontend gets step names
 * and statuses; an admin console also gets the output, the error and the child
 * run ids. That is a parameter, not a second copy of the loop.
 */

const TERMINAL: ReadonlySet<string> = new Set<WorkflowStatus>([
  'completed',
  'failed',
  'cancelled',
])

const DEFAULT_POLL_INTERVAL_MS = 500

export interface WorkflowStatusStreamParams {
  workflowRunService: WorkflowRunService
  runId: string
  channel: Pick<PikkuChannel<unknown, any>, 'send' | 'close'>
  session: CoreUserSession | undefined
  /**
   * Whether to include what the run produced. Off for the user-facing route:
   * a workflow's output and its error messages are internal detail, and a step
   * that spawned a child run says so only to tooling that can follow it.
   */
  detailed?: boolean
  pollIntervalMs?: number
}

/**
 * Streams one run's progress until it reaches a terminal state.
 *
 * Polled rather than subscribed because a run's steps are written by whichever
 * worker picked them up, in whichever process — there is no in-memory event to
 * listen for that every deployment shape would deliver.
 *
 * Each poll sends only when something changed, compared by a hash of exactly
 * what this stream reports. A run that sits on a slow step for a minute costs
 * one message, not a hundred and twenty.
 */
export const streamWorkflowRunStatus = async ({
  workflowRunService,
  runId,
  channel,
  session,
  detailed = false,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: WorkflowStatusStreamParams): Promise<void> => {
  let lastHash = ''
  let initSent = false

  const poll = async (): Promise<boolean> => {
    const run = await workflowRunService.getRun(runId)
    if (!run) {
      await channel.close()
      return false
    }
    // Checked on every poll, not just the first: ownership is read from the run
    // itself, and a stream that outlives a session should stop rather than keep
    // reporting.
    assertWorkflowRunOwner(run.wire, session)

    const steps = await workflowRunService.getRunSteps(runId)

    // A deterministic run knows its whole shape up front, so the client can
    // draw every step — including the ones not started — before anything runs.
    // A dynamic run has nothing to send here, and gets no init frame.
    if (!initSent && run.deterministic) {
      const statusByStep = new Map(
        steps.map((step) => [step.stepName, step.status])
      )
      await channel.send({
        type: 'init',
        deterministic: true,
        steps: (run.plannedSteps ?? []).map((step) => ({
          stepName: step.stepName,
          status: statusByStep.get(step.stepName) ?? 'pending',
        })),
      })
      initSent = true
    }

    const hash = JSON.stringify({
      s: run.status,
      ...(detailed ? { o: run.output } : {}),
      steps: steps.map((step) => [step.stepName, step.status]),
    })

    if (hash !== lastHash) {
      lastHash = hash
      await channel.send({
        type: 'update',
        status: run.status,
        ...(detailed ? { output: run.output, error: run.error } : {}),
        steps: steps.map((step) => ({
          stepName: step.stepName,
          status: step.status,
          ...(detailed && step.childRunId
            ? { childRunId: step.childRunId }
            : {}),
        })),
      })
    }

    if (TERMINAL.has(run.status)) {
      await channel.send({ type: 'done' })
      await channel.close()
      return false
    }
    return true
  }

  // Every exit from here closes the channel, including the ones a throw takes:
  // `assertWorkflowRunOwner` rejecting a session that lost access is exactly
  // the case where the stream should end rather than be left hanging open.
  try {
    // A run that is already finished is answered without ever starting a timer.
    if (!(await poll())) {
      return
    }

    // The next poll is scheduled when the previous one resolves rather than on
    // a fixed interval. A timer that fires regardless would let two polls
    // overlap on a slow store — both seeing `initSent` unset and sending the
    // init frame twice, and racing `lastHash` into out-of-order updates.
    while (
      await new Promise<boolean>((resolve, reject) => {
        setTimeout(() => void poll().then(resolve, reject), pollIntervalMs)
      })
    ) {
      // The condition is the whole loop: poll until it says to stop.
    }
  } catch (error) {
    await channel.close()
    throw error
  }
}
