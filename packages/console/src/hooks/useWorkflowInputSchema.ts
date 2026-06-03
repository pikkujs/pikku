import { useMemo } from 'react'
import type { RJSFSchema } from '@rjsf/utils'
import { useWorkflowContext } from '../context/WorkflowContext'
import { useFunctionMeta, useSchema } from './useWirings'

/**
 * Derives the JSON schema for a workflow's trigger input.
 *
 * For dynamic workflows whose nodes reference `trigger` paths, a synthetic
 * schema is built from those paths. Otherwise the schema is resolved from the
 * entry function's (or workflow handler's) input schema.
 *
 * Shared by the "New Run" form and the read-only run-input view so both render
 * the same fields.
 */
export function useWorkflowInputSchema(): {
  schema: RJSFSchema | null
  isLoading: boolean
} {
  const { workflow } = useWorkflowContext()

  const triggerSchema = useMemo<RJSFSchema | null>(() => {
    if (workflow?.source !== 'dynamic-workflow' || !workflow?.nodes) return null
    const fields = new Set<string>()
    for (const node of Object.values(workflow.nodes as Record<string, any>)) {
      if (!node.input) continue
      for (const val of Object.values(node.input as Record<string, any>)) {
        if (
          val &&
          typeof val === 'object' &&
          val.$ref === 'trigger' &&
          val.path
        ) {
          fields.add(val.path)
        }
      }
    }
    if (fields.size === 0) return null
    const properties: Record<string, any> = {}
    for (const f of fields) properties[f] = { type: 'string' }
    return {
      type: 'object' as const,
      properties,
      required: [...fields],
    }
  }, [workflow])

  const inputFuncId = useMemo(() => {
    if (triggerSchema) return null
    if (
      workflow?.source === 'graph' ||
      workflow?.source === 'dynamic-workflow'
    ) {
      const entryNodeId = workflow.entryNodeIds?.[0]
      const entryNode = entryNodeId ? workflow.nodes?.[entryNodeId] : null
      return entryNode?.rpcName ?? null
    }
    return workflow?.pikkuFuncId ?? null
  }, [workflow, triggerSchema])

  const { data: funcMeta, isLoading: funcLoading } = useFunctionMeta(
    inputFuncId ?? ''
  )
  const inputSchemaName = funcMeta?.inputSchemaName
  const { data: schema, isLoading: schemaLoading } = useSchema(inputSchemaName)

  const isLoading =
    (!!inputFuncId && funcLoading) || (!!inputSchemaName && schemaLoading)

  return {
    schema: (triggerSchema ?? schema) as RJSFSchema | null,
    isLoading,
  }
}
