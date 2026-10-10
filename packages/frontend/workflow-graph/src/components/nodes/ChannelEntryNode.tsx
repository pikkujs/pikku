import React from 'react'
import type { GraphNodeProps } from '../../types'
import { Handle, Position } from '@xyflow/react'
import { asI18n } from '@pikku/react'
import type { I18nNode } from '@pikku/react'
import { ArrowRight } from 'lucide-react'
import { nodeColor } from '../../colors'
import { useGraphActions } from '../../context/GraphHostContext'

/** Handler names are code identifiers shown as written, not copy to translate. */
const HANDLER_NAMES: Record<string, string> = {
  onConnect: 'onConnect',
  onMessage: 'onMessage',
  onDisconnect: 'onDisconnect',
}

interface HandlerRowProps {
  label: I18nNode
  handleId: string
}

const HandlerRow: React.FC<HandlerRowProps> = ({ label, handleId }) => {
  return (
    <div className="relative flex items-center justify-between gap-2 py-1 pl-4 pr-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <ArrowRight size={14} />
      <Handle
        type="source"
        position={Position.Right}
        id={handleId}
        style={{
          background: nodeColor('teal'),
          width: 8,
          height: 8,
          right: -4,
        }}
      />
    </div>
  )
}

interface ChannelEntryNodeData {
  channelName: string
  route: string
  handlers: string[]
  categories: string[]
  channelMeta: any
}

export const ChannelEntryNode: React.FC<
  GraphNodeProps<ChannelEntryNodeData>
> = ({ data }) => {
  const { openChannel } = useGraphActions()

  const handleClick = React.useCallback(() => {
    openChannel(data.channelName, data.channelMeta)
  }, [data.channelName, data.channelMeta, openChannel])

  return (
    <div
      className="relative w-[220px] cursor-pointer overflow-visible rounded-md border bg-card text-card-foreground shadow-md"
      onClick={handleClick}
    >
      <div
        className="absolute bottom-0 left-0 top-0 w-1 rounded-l-md"
        style={{ backgroundColor: nodeColor('teal') }}
      />

      <div className="flex flex-col py-2">
        <div className="px-4 pb-1">
          <div className="text-base font-semibold">
            {asI18n(data.channelName)}
          </div>
          <div className="text-sm text-muted-foreground">
            {asI18n(data.route)}
          </div>
        </div>

        {data.handlers.includes('connect') && (
          <HandlerRow
            label={asI18n(HANDLER_NAMES.onConnect)}
            handleId="connect"
          />
        )}
        {data.handlers.includes('disconnect') && (
          <HandlerRow
            label={asI18n(HANDLER_NAMES.onDisconnect)}
            handleId="disconnect"
          />
        )}
        {data.handlers.includes('message') && (
          <HandlerRow
            label={asI18n(HANDLER_NAMES.onMessage)}
            handleId="message"
          />
        )}
        {data.categories.map((cat) => (
          <HandlerRow
            key={cat}
            label={asI18n(cat)}
            handleId={`category-${cat}`}
          />
        ))}
      </div>
    </div>
  )
}
