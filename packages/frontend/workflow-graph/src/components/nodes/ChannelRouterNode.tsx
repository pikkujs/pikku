import React from 'react'
import type { GraphNodeProps } from '../../types'
import { Handle, Position } from '@xyflow/react'
import { asI18n } from '@pikku/react'
import type { I18nNode } from '@pikku/react'
import { ArrowRight } from 'lucide-react'
import { nodeColor } from '../../colors'

interface ActionRowProps {
  label: I18nNode
  handleId: string
}

const ActionRow: React.FC<ActionRowProps> = ({ label, handleId }) => {
  return (
    <div className="relative flex items-center justify-between gap-2 py-1 pl-4 pr-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <ArrowRight size={14} />
      <Handle
        type="source"
        position={Position.Right}
        id={handleId}
        style={{
          background: nodeColor('router'),
          width: 8,
          height: 8,
          right: -4,
        }}
      />
    </div>
  )
}

interface ChannelRouterNodeData {
  category: string
  actions: string[]
}

export const ChannelRouterNode: React.FC<
  GraphNodeProps<ChannelRouterNodeData>
> = ({ data }) => {
  return (
    <div className="relative w-[200px] overflow-visible rounded-md border bg-card text-card-foreground shadow-md">
      <Handle
        type="target"
        position={Position.Left}
        style={{ cursor: 'default' }}
      />

      <div
        className="absolute bottom-0 left-0 top-0 w-1 rounded-l-md"
        style={{ backgroundColor: nodeColor('router') }}
      />

      <div className="flex flex-col py-2">
        <div className="px-4 pb-1">
          <div className="text-sm font-semibold">{asI18n(data.category)}</div>
        </div>

        {data.actions.map((action) => (
          <ActionRow
            key={action}
            label={asI18n(action)}
            handleId={`action-${action}`}
          />
        ))}
      </div>
    </div>
  )
}
