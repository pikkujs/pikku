import React from 'react'
import type { Node } from '@xyflow/react'
import type { GraphNodeProps } from '../../types'
import { useGraphFunctionMeta } from '../../context/GraphHostContext'
import { FunctionIcon } from '../FunctionIcon'
import { useGraphActions } from '../../context/GraphHostContext'
import { useGraphHighlight } from '../../context/GraphHostContext'
import { FlowNode } from './FlowNode'

interface FunctionNodeData {
  type: string
  title: string
  stepName?: string
  description?: string
  colorKey: string
  inWorkflow?: boolean
  terminal?: boolean
}

interface FunctionNodeProps extends GraphNodeProps<FunctionNodeData> {
  inFlow?: boolean
}

type HighlightType = 'focused' | 'referenced' | null

export const FunctionNode: React.FC<FunctionNodeProps> = ({
  data,
  id,
  inFlow = true,
}) => {
  const { data: funcMeta } = useGraphFunctionMeta(data.title)
  const { openFunction, openWorkflowStep } = useGraphActions()
  const graphHighlight = useGraphHighlight()

  const highlightType: HighlightType = React.useMemo(() => {
    if (!graphHighlight || !data.inWorkflow) return null
    if (graphHighlight.focusedNodeId === id) return 'focused'
    if (graphHighlight.referencedNodeId === id) return 'referenced'
    return null
  }, [graphHighlight, data.inWorkflow, id])

  const handleClick = React.useCallback(() => {
    if (data.inWorkflow) {
      openWorkflowStep(id, 'rpc')
    } else {
      openFunction(data.title, funcMeta)
    }
  }, [
    data.title,
    data.inWorkflow,
    id,
    funcMeta,
    openFunction,
    openWorkflowStep,
  ])

  const hasStepName = !!data.stepName
  const label = data.stepName || data.description || data.title
  const subtitle = hasStepName ? data.title : undefined

  return (
    <FlowNode
      icon={FunctionIcon}
      colorKey={data.colorKey}
      hasInput={inFlow}
      outputHandles={data.terminal ? [] : [{ id: 'default', label: '' }]}
      size={80}
      label={label}
      labelDimmed={!hasStepName}
      subtitle={subtitle}
      onClick={handleClick}
      showBorder={false}
      highlightType={highlightType}
      nodeId={id}
    />
  )
}

export const getFunctionNodeConfig = (
  id: string,
  pikkuFuncId: string,
  position: { x: number; y: number },
  description?: string,
  _order?: number,
  _funcMeta?: any,
  step?: any
): Node => {
  const inWorkflow = step !== undefined
  return {
    id,
    type: 'functionNode',
    position,
    data: {
      type: 'Function',
      title: pikkuFuncId,
      stepName: description,
      colorKey: 'function',
      nodeType: 'rpc',
      inWorkflow,
    },
  }
}
