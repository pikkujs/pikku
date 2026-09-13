import React from 'react'
import type { GraphNodeProps } from '../../types'
import { BaseNode } from './BaseNode'

interface DecisionNodeData {
  icon: React.ComponentType<{ size?: number }>
  colorKey: string
  title: string
  description?: string
  actions: string[]
}

export const DecisionNode: React.FC<GraphNodeProps<DecisionNodeData>> = ({
  data,
}) => {
  return <BaseNode data={data} hasInput={true} hasOutput={true} width={200} />
}
