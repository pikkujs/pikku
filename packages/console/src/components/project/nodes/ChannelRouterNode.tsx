import React from 'react'
import type { NodeProps } from 'reactflow'
import { Handle, Position } from 'reactflow'
import { Box, Paper, Text, Stack, useMantineTheme } from '@mantine/core'
import { ArrowRight } from 'lucide-react'

interface ActionRowProps {
  label: string
  handleId: string
}

const ActionRow: React.FunctionComponent<ActionRowProps> = ({
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
          background: 'var(--mantine-color-violet-6)',
          width: 8,
          height: 8,
          right: -4,
        }}
      />
    </Box>
  )
}

interface ChannelRouterNodeData {
  category: string
  actions: string[]
}

export const ChannelRouterNode: React.FunctionComponent<
  NodeProps<ChannelRouterNodeData>
> = ({ data }) => {
  const theme = useMantineTheme()

  return (
    <Paper
      shadow="md"
      radius="md"
      w={200}
      style={{
        overflow: 'visible',
        position: 'relative',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ cursor: 'default' }}
      />

      <Box
        pos="absolute"
        left={0}
        top={0}
        bottom={0}
        w={4}
        style={{
          backgroundColor: theme.colors.violet[5],
          borderTopLeftRadius: theme.radius.md,
          borderBottomLeftRadius: theme.radius.md,
        }}
      />

      <Stack gap={0} py="xs">
        <Box px="md" pb={4}>
          <Text size="sm" fw={600}>
            {data.category}
          </Text>
        </Box>

        {data.actions.map((action) => (
          <ActionRow
            key={action}
            label={action}
            handleId={`action-${action}`}
          />
        ))}
      </Stack>
    </Paper>
  )
}
