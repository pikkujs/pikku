import { useMemo } from 'react'
import type { RJSFSchema } from '@rjsf/utils'
import { useWorkflowContext } from '../context/WorkflowContext'
import { useFunctionMeta, useSchema } from './useWirings'

/**
 * Derives the JSON schema for a workflow's trigger input.
 *
 * The schema is resolved from the entry function's (or workflow handler's) input
 * schema.
 *
 * Shared by the "New Run" form and the read-only run-input view so both render
 * the same fields.
 */
export function useWorkflowInputSchema(): {
  schema: RJSFSchema | null
  isLoading: boolean
} {
  const { workflow } = useWorkflowContext()

  const inputFuncId = useMemo(() => {
    if (workflow?.source === 'graph') {
      const entryNodeId = workflow.entryNodeIds?.[0]
      const entryNode = entryNodeId ? workflow.nodes?.[entryNodeId] : null
      return entryNode?.rpcName ?? null
    }
    return workflow?.pikkuFuncId ?? null
  }, [workflow])

  const { data: funcMeta, isLoading: funcLoading } = useFunctionMeta(
    inputFuncId ?? ''
  )
  const inputSchemaName = funcMeta?.inputSchemaName
  const { data: schema, isLoading: schemaLoading } = useSchema(inputSchemaName)

  const isLoading =
    (!!inputFuncId && funcLoading) || (!!inputSchemaName && schemaLoading)

  return {
    schema: schema as RJSFSchema | null,
    isLoading,
  }
}
