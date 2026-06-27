/**
 * CYCLIC graph: a node that loops back to itself until it converges.
 *
 *   begin → attempt --again--> attempt --…--> attempt --done--> finish
 *
 * `attempt` has a self-edge (`again`) so the engine must create a fresh ordinal
 * instance each pass (attempt, attempt#1, attempt#2 …), each recording the
 * predecessor it was reached from (fromStepName). Termination is the graph's
 * own responsibility: `attempt` counts passes in run state and branches `done`
 * once it hits the target, so the cycle converges instead of looping forever.
 */
import { pikkuSessionlessFunc } from '#pikku'

// Entry node: seed the run state, then hand off to the cyclic node.
export const cyclicBegin = pikkuSessionlessFunc<
  { attempts: number },
  { attempts: number }
>({
  func: async ({ logger }, data) => {
    logger.info(`[cyclic] begin — will loop ${data.attempts} time(s)`)
    return { attempts: data.attempts }
  },
})

// Self-cycling node: loop back via `again` until `count` reaches the target.
export const cyclicAttempt = pikkuSessionlessFunc<
  { target: number },
  { count: number; target: number }
>({
  func: async ({ logger }, data, { graph }) => {
    const state = await graph!.getState()
    const count = ((state.count as number) ?? 0) + 1
    await graph!.setState('count', count)
    const branch = count >= data.target ? 'done' : 'again'
    logger.info(`[cyclic] attempt #${count}/${data.target} → ${branch}`)
    graph!.branch(branch)
    return { count, target: data.target }
  },
})

// Terminal node: report how many passes the cycle took.
export const cyclicFinish = pikkuSessionlessFunc<
  { target: number },
  { ok: boolean; loops: number }
>({
  func: async ({ logger }, _data, { graph }) => {
    const state = await graph!.getState()
    const loops = (state.count as number) ?? 0
    logger.info(`[cyclic] finish — converged after ${loops} pass(es)`)
    return { ok: true, loops }
  },
})
