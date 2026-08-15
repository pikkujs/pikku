import React from 'react'
import {
  Box,
  Group,
  Paper,
  Stack,
  Text,
  useMantineTheme,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { Handle, Position } from 'reactflow'
import { Lock, LockOpen, Shield, Layers } from 'lucide-react'
import { PikkuBadge } from '../../ui/PikkuBadge'
import { useFlowDirection } from '../../../context/FlowDirectionContext'

interface OutputHandle {
  id: string
  label?: string
}

interface BaseNodeProps {
  data: {
    colorKey: string
    title: string
    description?: string
    tags?: string[]
    auth?: boolean
    permissionsCount?: number
    middlewareCount?: number
    onClick?: () => void
  }
  hasInput?: boolean
  hasOutput?: boolean
  outputHandles?: OutputHandle[]
  additionalBody?: React.ReactNode
  width?: number
  hideMetadataIndicators?: boolean
  inFlow?: boolean
}

export const BaseNode: React.FC<BaseNodeProps> = ({
  data,
  hasInput = false,
  hasOutput = true,
  outputHandles,
  additionalBody,
  width = 200,
  hideMetadataIndicators = false,
  inFlow = true,
}) => {
  const theme = useMantineTheme()
  const vertical = useFlowDirection() === 'DOWN'

  return (
    <Paper shadow="md" radius="md" w={width} pos="relative">
      {inFlow && hasInput && (
        <Handle
          type="target"
          position={vertical ? Position.Top : Position.Left}
          style={{ cursor: 'default' }}
        />
      )}

      <Box
        p="sm"
        className="nodrag"
        style={{ cursor: data.onClick ? 'pointer' : 'default' }}
        onClick={data.onClick}
      >
        <Stack gap={4}>
          <Text size="sm" c="dimmed" lineClamp={2}>
            {asI18n(data.title)}
          </Text>
          {data.description && (
            <Text size="sm" ff="monospace" fw={500}>
              {asI18n(data.description)}
            </Text>
          )}

          {data.tags && data.tags.length > 0 && (
            <Group gap={4}>
              {data.tags.map((tag) => (
                <PikkuBadge
                  key={tag}
                  type="dynamic"
                  badge="tag"
                  value={tag}
                  size="sm"
                  variant="light"
                  color={data.colorKey}
                />
              ))}
            </Group>
          )}

          {!hideMetadataIndicators &&
            (data.auth !== undefined ||
              (data.permissionsCount && data.permissionsCount > 0) ||
              (data.middlewareCount && data.middlewareCount > 0)) && (
              <Group gap={6}>
                {data.auth !== undefined &&
                  (data.auth ? (
                    <Lock size={12} strokeWidth={2} />
                  ) : (
                    <LockOpen size={12} strokeWidth={2} />
                  ))}

                {data.permissionsCount !== undefined &&
                  data.permissionsCount > 0 && (
                    <Group gap={4}>
                      <Shield size={12} strokeWidth={2} />
                      <Text size="sm" fw={500}>
                        {asI18n(String(data.permissionsCount))}
                      </Text>
                    </Group>
                  )}

                {data.middlewareCount !== undefined &&
                  data.middlewareCount > 0 && (
                    <Group gap={4}>
                      <Layers size={12} strokeWidth={2} />
                      <Text size="sm" fw={500}>
                        {asI18n(String(data.middlewareCount))}
                      </Text>
                    </Group>
                  )}
              </Group>
            )}

          {additionalBody}
        </Stack>
      </Box>

      {inFlow &&
        (outputHandles && outputHandles.length > 0
          ? outputHandles.map((handle, index) => {
              const total = outputHandles.length
              const minOffset = 25
              const maxOffset = 75
              const offsetPercent =
                total === 1
                  ? 50
                  : minOffset + ((maxOffset - minOffset) / (total - 1)) * index

              return (
                <Box
                  key={handle.id}
                  pos="absolute"
                  {...(vertical ? { bottom: -12 } : { right: -12 })}
                  style={{
                    ...(vertical
                      ? {
                          left: `${offsetPercent}%`,
                          transform: 'translateX(-50%)',
                          flexDirection: 'column' as const,
                        }
                      : {
                          top: `${offsetPercent}%`,
                          transform: 'translateY(-50%)',
                        }),
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Text size="sm" c="dimmed" ff="monospace" fw={500}>
                    {asI18n(handle.label || handle.id)}
                  </Text>
                  <Handle
                    type="source"
                    position={vertical ? Position.Bottom : Position.Right}
                    id={handle.id}
                    style={{
                      position: 'relative',
                      right: 0,
                      transform: 'none',
                      cursor: 'default',
                    }}
                  />
                </Box>
              )
            })
          : hasOutput && (
              <Handle
                type="source"
                position={vertical ? Position.Bottom : Position.Right}
                style={{ cursor: 'default' }}
              />
            ))}
    </Paper>
  )
}
