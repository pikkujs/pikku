import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'

/**
 * A run shaped to be killed.
 *
 * Three phases separated by timers, each recording a distinct ledger key, so
 * that after a kill and restart the ledger says exactly which phases had run
 * and the run status says which the orchestrator believes had run. Recovery is
 * correct only when those two agree — a phase present in the ledger but marked
 * pending is a lost effect, and a phase re-recorded after restart is a
 * duplicated one.
 */
export const chaosRestartWorkflow = pikkuWorkflowFunc<
  {
    tag: string
    sleepFor?: string
    /** Widen phase two so a kill reliably lands while it is executing. */
    phaseTwoDelayMs?: number
  },
  { tag: string; phases: number[] }
>({
  func: async ({}, data, { workflow }) => {
    const one = await workflow.do('Phase one', 'chaosStep', {
      key: `phase1:${data.tag}`,
      echo: data.tag,
    })

    await workflow.sleep('Wait between one and two', data.sleepFor ?? '3s')

    const two = await workflow.do('Phase two', 'chaosStep', {
      key: `phase2:${data.tag}`,
      delayMs: data.phaseTwoDelayMs,
      echo: data.tag,
    })

    await workflow.sleep('Wait between two and three', data.sleepFor ?? '3s')

    const three = await workflow.do('Phase three', 'chaosStep', {
      key: `phase3:${data.tag}`,
      echo: data.tag,
    })

    return {
      tag: data.tag,
      phases: [one.totalEffects, two.totalEffects, three.totalEffects],
    }
  },
  tags: ['chaos', 'restart'],
})
