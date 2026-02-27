import React from 'react'
import type { Node, NodeProps } from 'reactflow'
import { Handle, Position } from 'reactflow'
import { Box, Paper, Text, Stack, useMantineTheme } from '@mantine/core'
import { ArrowRight } from 'lucide-react'
import { usePanelContext } from '@/context/PanelContext'

interface ChannelWiringNodeData {
  colorKey: string
  channelName: string
  onConnect?: string
  onDisconnect?: string
  onMessage?: string
  onMessageRoute?: Record<string, string>
}

interface HandlerRowProps {
  label: string
  handleId: string
  hasTarget: boolean
}

const HandlerRow: React.FunctionComponent<HandlerRowProps> = ({
  label,
  handleId,
  hasTarget,
}) => {
  return (
    <Box
      px="xs"
      pl="md"
      py={4}
      style={{
        position: 'relative',
        opacity: hasTarget ? 1 : 0.4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}
    >
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      {hasTarget && (
        <>
          <ArrowRight size={12} />
          <Handle
            type="source"
            position={Position.Right}
            id={handleId}
            style={{
              background: 'var(--mantine-color-teal-6)',
              width: 8,
              height: 8,
              right: -4,
            }}
          />
        </>
      )}
    </Box>
  )
}

export const ChannelWiringNode: React.FunctionComponent<
  NodeProps<ChannelWiringNodeData>
> = ({ data, id }) => {
  const { openWorkflowStep } = usePanelContext()
  const theme = useMantineTheme()

  const handleClick = React.useCallback(() => {
    openWorkflowStep(id, 'trigger')
  }, [id, openWorkflowStep])

  const routeEntries = data.onMessageRoute
    ? Object.entries(data.onMessageRoute)
    : []

  return (
    <Paper
      shadow="md"
      radius="md"
      w={180}
      style={{
        cursor: 'pointer',
        overflow: 'hidden',
        position: 'relative',
      }}
      onClick={handleClick}
    >
      <Box
        pos="absolute"
        left={0}
        top={0}
        bottom={0}
        w={4}
        style={{
          backgroundColor: theme.colors.gray[5],
          borderTopLeftRadius: theme.radius.md,
          borderBottomLeftRadius: theme.radius.md,
        }}
      />

      <Stack gap={0} py={4}>
        <HandlerRow
          label="onConnect"
          handleId="onConnect"
          hasTarget={!!data.onConnect}
        />
        <HandlerRow
          label="onMessage"
          handleId="onMessage"
          hasTarget={!!data.onMessage}
        />
        {routeEntries.map(([route, target]) => (
          <HandlerRow
            key={route}
            label={`→ ${route}`}
            handleId={`route-${route}`}
            hasTarget={!!target}
          />
        ))}
        <HandlerRow
          label="onDisconnect"
          handleId="onDisconnect"
          hasTarget={!!data.onDisconnect}
        />
      </Stack>
    </Paper>
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
      colorKey: 'teal',
      channelName: wire.name || 'Channel',
      onConnect: wire.onConnect,
      onDisconnect: wire.onDisconnect,
      onMessage: wire.onMessage,
      onMessageRoute: wire.onMessageRoute,
      nodeType: 'wiring',
    },
  }
}
