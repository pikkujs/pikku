import { pikkuState } from '../../pikku-state.js'
import { addFunction } from '../../function/function-runner.js'
import { addWorkflow } from '../workflow/dsl/workflow-runner.js'
import { wireScheduler } from '../scheduler/scheduler-runner.js'
import {
  ATTENTION_CHECK_RETRIES,
  attentionCheckName,
  attentionStoreName,
  attentionWorkflowName,
  checkAttention,
  refreshWatchedAttention,
  storeAttention,
  type AttentionOutcome,
} from './attention-func-run.js'
import type {
  AttentionFuncInput,
  PikkuAttentionFunc,
} from './attention-func.types.js'

const registerHelper = (name: string, func: (...args: any[]) => any) => {
  addFunction(name, { func } as never)
  pikkuState(null, 'rpc', 'meta')[name] = name
  pikkuState(null, 'function', 'meta')[name] = {
    name,
    pikkuFuncId: name,
    sessionless: true,
    permissions: [],
    functionType: 'helper',
    inputSchemaName: null,
    outputSchemaName: null,
  } as never
}

/**
 * Registers an attention func under its widget id: its two workflow steps, the
 * workflow itself and the scheduled task that refreshes it. Called by generated
 * code.
 *
 * Skipped with a warning when the CLI recorded no metadata (attention funcs
 * must be declared in a `*.attention.ts` file).
 *
 * @throws Error when a func for the same widget is already registered.
 * @internal
 */
export const addAttentionFunc = (
  widget: string,
  attention: PikkuAttentionFunc<any>,
  packageName: string | null = null
) => {
  const meta = pikkuState(packageName, 'attention', 'meta')[widget]
  if (!meta) {
    console.warn(
      `[pikku] Skipping attention func '${widget}' — metadata not found. Attention funcs must be declared in a *.attention.ts file.`
    )
    return
  }
  // The runtime (admin RPCs, workflow, schedule) reads one registry, so an
  // addon's funcs land beside the app's.
  const funcs = pikkuState(null, 'attention', 'funcs')
  if (funcs.has(widget)) {
    throw new Error(`Attention func already exists: ${widget}`)
  }
  funcs.set(widget, attention)
  pikkuState(null, 'attention', 'meta')[widget] = meta

  const check = attentionCheckName(widget)
  const store = attentionStoreName(widget)
  const workflow = attentionWorkflowName(widget)

  registerHelper(check, (services, data, wire) =>
    checkAttention(attention, services, data, wire)
  )
  registerHelper(store, (services, data) =>
    storeAttention(services, widget, data)
  )

  pikkuState(null, 'workflows', 'meta')[workflow] = {
    name: workflow,
    pikkuFuncId: workflow,
    source: 'dsl',
    graphHash: `${workflow}-${meta.every}`,
    description: `Checks '${widget}' and stores what it found`,
  } as never
  pikkuState(null, 'function', 'meta')[workflow] = {
    name: workflow,
    pikkuFuncId: workflow,
    sessionless: true,
    permissions: [],
  } as never
  addWorkflow(workflow, {
    func: async (_services: any, data: AttentionFuncInput, wire: any) => {
      const outcome: AttentionOutcome = await wire.workflow
        .do(`Check ${widget}`, check, data, {
          retries: ATTENTION_CHECK_RETRIES,
          retryDelay: '1s',
        })
        .catch((error: Error): AttentionOutcome => ({
          status: 'failed',
          error: error?.message ?? String(error),
        }))
      await wire.workflow.do(`Store ${widget}`, store, {
        projectKey: data.projectKey,
        outcome,
      })
    },
  } as never)

  const task = `${workflow}.refresh`
  pikkuState(null, 'scheduler', 'meta')[task] = {
    name: task,
    pikkuFuncId: task,
    schedule: meta.schedule,
  } as never
  wireScheduler({
    name: task,
    schedule: meta.schedule,
    func: {
      func: async (services: any, _data: unknown, wire: any) => {
        await refreshWatchedAttention(services, wire, widget)
      },
    },
  } as never)
}

/** Every registered attention func, keyed by widget id. */
export const getAttentionFuncs = () => pikkuState(null, 'attention', 'funcs')

/** The CLI-generated metadata for every attention func, keyed by widget id. */
export const getAttentionFuncsMeta = () => pikkuState(null, 'attention', 'meta')
