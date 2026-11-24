import { pikkuWorkflowComplexFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'
import {
  runHarness,
  type HarnessResult,
} from '@pikku/addon-changes-cli/harness'
import {
  findHarnessTools,
  scriptedGates,
  type HarnessRunInput,
} from '../functions/harness-run.functions.js'

/**
 * One changeset through the harness engine, durably: every agent turn, gate run, fix commit,
 * write-guard snapshot and `markDone` is an inline step of the run, so a run killed mid-step picks
 * up from its recorded steps. The engine's loop and dynamic gate list are why this is a complex
 * workflow rather than an inspected one. The engine runs only in a harness run, which
 * `harnessStartRun` starts.
 *
 * The body only calls `workflow.do` (itself and through the engine); the tools' paths are found
 * in a step of their own, so a replay uses the paths the run started with.
 */
export const harnessRunWorkflow = pikkuWorkflowComplexFunc<
  HarnessRunInput,
  /** How the run ended: the engine's `HarnessResult`, spelled out so its schema is generated. */
  {
    status:
      'done' | 'gave-up' | 'repeated' | 'infra' | 'needs-answer' | 'failed'
    attempts: number
    feedbackHistory: string[]
    notes: {
      gate: string
      attempt: number
      finding: {
        file?: string
        line?: number
        severity: 'low' | 'medium' | 'high'
        rule?: string
        message: string
      }
    }[]
    failing?: {
      gate: string
      findings: {
        file?: string
        line?: number
        severity: 'low' | 'medium' | 'high'
        rule?: string
        message: string
      }[]
    }[]
    infra?: { gate: string; kind: string; message: string }
  }
>({
  auth: false,
  expose: true,
  tags: ['harness'],
  func: async ({ variables }, data, { workflow, rpc }) => {
    const tools = await workflow.do(
      'Find the tools',
      () => findHarnessTools(variables, data.worktree),
      { retries: 0 }
    )
    const result: HarnessResult = await runHarness({
      worktree: data.worktree,
      base: data.base,
      changeId: data.changeId,
      shortId: data.shortId,
      changeset: data.changeset,
      harness: {
        name: 'e2e',
        gates: scriptedGates(data.script, data.changeId, tools),
        policy: { tries: data.tries },
      },
      agent: (input) =>
        rpc.invoke('harnessScriptedAgent', {
          ...input,
          worktree: data.worktree,
          changeId: data.changeId,
          shortId: data.shortId,
          script: data.script,
        }),
      markDone: async () => {
        await rpc.invoke('harnessMarkChangeDone', {
          worktree: data.worktree,
          changeId: data.changeId,
        })
      },
      workflow,
    })
    return result
  },
})
