import React from 'react'
import type { NodeProps } from 'reactflow'
import { BaseNode } from './BaseNode'

interface ChannelNodeData {
  icon: React.ComponentType<{ size?: number }>
  colorKey: string
  title: string
  description?: string
  tags?: string[]
  auth?: boolean
  permissionsCount?: number
  middlewareCount?: number
  // Channel-specific fields
  hasConnect?: boolean
  hasDisconnect?: boolean
  hasMessage?: boolean
  messageActions?: string[]
}

export const ChannelNode: React.FunctionComponent<
  NodeProps<ChannelNodeData>
> = ({ data }) => {
  return <BaseNode data={data} hasInput={false} hasOutput={true} width={250} />
}
