import { z } from 'zod'
import type { WorkflowWireDoRPC } from '@pikku/core/workflow'
import { pikkuSessionlessFunc } from '#pikku'

export const FanoutInput = z.object({
  items: z
    .array(z.unknown())
    .describe('The array to fan out over — one child invocation per element'),
  child: z
    .string()
    .describe('RPC name invoked once per item as a durable child step'),
  childInput: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      'Per-item input template; `$item` references resolve against the current element'
    ),
  mode: z
    .enum(['parallel', 'sequential'])
    .default('parallel')
    .describe('Run child invocations concurrently or one after another'),
  stepPrefix: z
    .string()
    .optional()
    .describe(
      'Stable prefix for the per-item durable step names (`<prefix>#<index>`); defaults to `child`'
    ),
})

export const FanoutOutput = z
  .array(z.unknown())
  .describe('Child results in the same order as the input items')

function getValueAtPath(obj: any, path: string): any {
  if (!path) return obj
  let current = obj
  for (const part of path.split('.')) {
    if (current == null) return undefined
    current = current[part]
  }
  return current
}

function resolveItemTemplate(value: any, item: unknown): any {
  if (Array.isArray(value)) {
    return value.map((v) => resolveItemTemplate(v, item))
  }
  if (value && typeof value === 'object') {
    if (value.$ref === '$item') {
      return value.path ? getValueAtPath(item, value.path) : item
    }
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = resolveItemTemplate(v, item)
    }
    return out
  }
  return value
}

export const fanout = pikkuSessionlessFunc({
  description:
    'Fan out over an array, invoking a child RPC once per element and collecting the ordered results',
  node: { displayName: 'Fan Out', category: 'Array', type: 'action' },
  input: FanoutInput,
  output: FanoutOutput,
  func: async (_services, data, { workflow }) => {
    if (!workflow) {
      throw new Error('graph:fanout can only be called from within a workflow')
    }
    if (!Array.isArray(data.items)) {
      throw new Error(
        `graph:fanout expected an array to fan out over but received ${typeof data.items}`
      )
    }

    const prefix = data.stepPrefix ?? data.child
    // `child` is a runtime-resolved RPC name (often another addon's, never in
    // this package's RPCMap), so use the dynamic-name RPC form of do().
    const doRpc = workflow.do as WorkflowWireDoRPC
    const runChild = (item: unknown, index: number) =>
      doRpc(
        `${prefix}#${index}`,
        data.child,
        resolveItemTemplate(data.childInput ?? {}, item)
      )

    if (data.mode === 'sequential') {
      const results: unknown[] = []
      for (let i = 0; i < data.items.length; i++) {
        results.push(await runChild(data.items[i], i))
      }
      return results
    }

    return await Promise.all(data.items.map((item, i) => runChild(item, i)))
  },
})
