import React from 'react'
import type { NodeProps } from 'reactflow'
import { Handle, Position } from 'reactflow'
import { Box, Paper, Text, Stack, useMantineTheme } from '@mantine/core'
import { ArrowRight } from 'lucide-react'
import { usePanelContext } from '@/context/PanelContext'

interface HandlerRowProps {
  label: string
  handleId: string
}

const HandlerRow: React.FunctionComponent<HandlerRowProps> = ({
  label,
  handleId,
}) => {
  return (
    <Box
      px="xs"
      pl="md"
      py={4}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}
    >
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <ArrowRight size={14} />
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
    </Box>
  )
}

interface ChannelEntryNodeData {
  channelName: string
  route: string
  handlers: string[]
  categories: string[]
  channelMeta: any
}

export const ChannelEntryNode: React.FunctionComponent<
  NodeProps<ChannelEntryNodeData>
> = ({ data }) => {
  const { openChannel } = usePanelContext()
  const theme = useMantineTheme()

  const handleClick = React.useCallback(() => {
    openChannel(data.channelName, data.channelMeta)
  }, [data.channelName, data.channelMeta, openChannel])

  return (
    <Paper
      shadow="md"
      radius="md"
      w={220}
      style={{
        cursor: 'pointer',
        overflow: 'visible',
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
          backgroundColor: theme.colors.teal[5],
          borderTopLeftRadius: theme.radius.md,
          borderBottomLeftRadius: theme.radius.md,
        }}
      />

      <Stack gap={0} py="xs">
        <Box px="md" pb={4}>
          <Text size="md" fw={600}>
            {data.channelName}
          </Text>
          <Text size="sm" c="dimmed">
            {data.route}
          </Text>
        </Box>

        {data.handlers.includes('connect') && (
          <HandlerRow label="onConnect" handleId="connect" />
        )}
        {data.handlers.includes('disconnect') && (
          <HandlerRow label="onDisconnect" handleId="disconnect" />
        )}
        {data.handlers.includes('message') && (
          <HandlerRow label="onMessage" handleId="message" />
        )}
        {data.categories.map((cat) => (
          <HandlerRow key={cat} label={cat} handleId={`category-${cat}`} />
        ))}
      </Stack>
    </Paper>
  )
}
