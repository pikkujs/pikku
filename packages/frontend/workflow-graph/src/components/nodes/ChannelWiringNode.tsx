import React from 'react'
import type { Node } from '@xyflow/react'
import type { GraphNodeProps } from '../../types'
import { Handle, Position } from '@xyflow/react'
import { asI18n } from '@pikku/react'
import type { I18nNode } from '@pikku/react'
import { ArrowRight } from 'lucide-react'
import { nodeColor } from '../../colors'
import { useGraphActions } from '../../context/GraphHostContext'

interface ChannelWiringNodeData {
  colorKey: string
  channelName: string
  onConnect?: string
  onDisconnect?: string
  onMessage?: string
  onMessageRoute?: Record<string, string>
}

/** Handler names are code identifiers shown as written, not copy to translate. */
const HANDLER_NAMES: Record<string, string> = {
  onConnect: 'onConnect',
  onMessage: 'onMessage',
  onDisconnect: 'onDisconnect',
}

interface HandlerRowProps {
  label: I18nNode
  handleId: string
  hasTarget: boolean
}

const HandlerRow: React.FC<HandlerRowProps> = ({
  label,
  handleId,
  hasTarget,
}) => {
  return (
    <div
      className={`relative flex items-center justify-between gap-2 py-1 pl-4 pr-2 ${hasTarget ? '' : 'opacity-40'}`}
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      {hasTarget && (
        <>
          <ArrowRight size={12} />
          <Handle
            type="source"
            position={Position.Right}
            id={handleId}
            style={{
              background: nodeColor('channel'),
              width: 8,
              height: 8,
              right: -4,
            }}
          />
        </>
      )}
    </div>
  )
}

export const ChannelWiringNode: React.FC<
  GraphNodeProps<ChannelWiringNodeData>
> = ({ data, id }) => {
  const { openWorkflowStep } = useGraphActions()

  const handleClick = React.useCallback(() => {
    openWorkflowStep(id, 'trigger')
  }, [id, openWorkflowStep])

  const routeEntries = data.onMessageRoute
    ? Object.entries(data.onMessageRoute)
    : []

  return (
    <div
      className="relative w-[180px] cursor-pointer overflow-hidden rounded-md border bg-card text-card-foreground shadow-md"
      onClick={handleClick}
    >
      <div className="absolute bottom-0 left-0 top-0 w-1 rounded-l-md bg-muted-foreground" />

      <div className="flex flex-col py-1">
        <HandlerRow
          label={asI18n(HANDLER_NAMES.onConnect)}
          handleId="onConnect"
          hasTarget={!!data.onConnect}
        />
        <HandlerRow
          label={asI18n(HANDLER_NAMES.onMessage)}
          handleId="onMessage"
          hasTarget={!!data.onMessage}
        />
        {routeEntries.map(([route, target]) => {
          const routeLabel: string = `→ ${route}`
          return (
            <HandlerRow
              key={route}
              label={asI18n(routeLabel)}
              handleId={`route-${route}`}
              hasTarget={!!target}
            />
          )
        })}
        <HandlerRow
          label={asI18n(HANDLER_NAMES.onDisconnect)}
          handleId="onDisconnect"
          hasTarget={!!data.onDisconnect}
        />
      </div>
    </div>
  )
}

export const getChannelWiringNodeConfig = (
  id: string,
  position: { x: number; y: number },
  wire: {
    name?: string
    onConnect?: string
    onDisconnect?: string
    onMessage?: string
    onMessageRoute?: Record<string, string>
  }
): Node => {
  return {
    id,
    type: 'channelWiringNode',
    position,
    data: {
      colorKey: 'channel',
      channelName: wire.name || 'Channel',
      onConnect: wire.onConnect,
      onDisconnect: wire.onDisconnect,
      onMessage: wire.onMessage,
      onMessageRoute: wire.onMessageRoute,
      nodeType: 'wiring',
    },
  }
}
