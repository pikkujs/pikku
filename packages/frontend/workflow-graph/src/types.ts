import type { NodeProps } from '@xyflow/react'

export type GraphNodeProps<D> = Omit<NodeProps, 'data'> & { data: D }
