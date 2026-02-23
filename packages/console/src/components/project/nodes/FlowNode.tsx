import React from 'react'
import { Box, Paper, Text, Stack, useMantineTheme } from '@mantine/core'
import { Handle, Position } from 'reactflow'
import { useWorkflowRunContextSafe } from '@/context/WorkflowRunContext'

interface OutputHandle {
  id: string
  label?: string
}

type BorderPosition = 'left' | 'right' | 'top'

type HighlightType = 'focused' | 'referenced' | null

const runStatusColors: Record<string, string> = {
  succeeded: 'green.4',
  failed: 'red.4',
  running: 'blue.4',
  scheduled: 'orange.4',
  pending: 'gray.4',
  suspended: 'yellow.4',
  cancelled: 'gray.5',
  skipped: 'gray.4',
}

interface FlowNodeProps {
  icon: React.ComponentType<{ size?: number }>
  colorKey: string
  hasInput?: boolean
  outputHandles?: OutputHandle[]
  size?: number
  label?: string
  labelDimmed?: boolean
  subtitle?: string
  onClick?: () => void
  borderPosition?: BorderPosition
  showBorder?: boolean
  borderColor?: string
  highlightType?: HighlightType
  nodeId?: string
}

const getBorderStyle = (
  position: BorderPosition,
  theme: any,
  borderColor?: string
) => {
  const color = borderColor || theme.colors.gray[5]
  const radius = theme.radius.md

  switch (position) {
    case 'left':
      return {
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
        height: 'auto',
        backgroundColor: color,
        borderTopLeftRadius: radius,
        borderBottomLeftRadius: radius,
      }
    case 'top':
      return {
        left: 0,
        right: 0,
        top: 0,
        width: 'auto',
        height: 4,
        backgroundColor: color,
        borderTopLeftRadius: radius,
        borderTopRightRadius: radius,
      }
    case 'right':
    default:
      return {
        right: 0,
        top: 0,
        bottom: 0,
        width: 4,
        height: 'auto',
        backgroundColor: color,
        borderTopRightRadius: radius,
        borderBottomRightRadius: radius,
      }
  }
}

const getHighlightIconColor = (
  highlightType: HighlightType,
  theme: any
): string | null => {
  if (!highlightType) return null
  if (highlightType === 'focused') return theme.colors.primary[5]
  return theme.colors.referencedNode[5]
}

export const FlowNode: React.FunctionComponent<FlowNodeProps> = ({
  icon: Icon,
  colorKey,
  hasInput = false,
  outputHandles = [],
  size = 80,
  label,
  labelDimmed = true,
  subtitle,
  onClick,
  borderPosition = 'right',
  showBorder = true,
  borderColor,
  highlightType = null,
  nodeId,
}) => {
  const theme = useMantineTheme()
  const highlightIconColor = getHighlightIconColor(highlightType, theme)
  const runContext = useWorkflowRunContextSafe()

  const runBgColor = React.useMemo(() => {
    if (!runContext?.selectedRunId || !nodeId) return null
    const stepState = runContext.stepStates.get(nodeId)
    let status = stepState?.status
    if (
      !status &&
      !hasInput &&
      runContext.stepStates.size === 0 &&
      runContext.runData?.status === 'failed'
    ) {
      status = 'failed'
    }
    if (!status) return null
    const colorPath = runStatusColors[status]
    if (!colorPath) return null
    const [colorName, shade] = colorPath.split('.')
    return theme.colors[colorName]?.[Number(shade)] || null
  }, [
    runContext?.selectedRunId,
    runContext?.stepStates,
    runContext?.runData?.status,
    nodeId,
    hasInput,
    theme,
  ])

  const iconColor =
    highlightIconColor ||
    (runBgColor ? 'white' : theme.colors.gray[5] || colorKey)

  return (
    <Box style={{ width: size, overflow: 'visible' }}>
      <Paper
        shadow="md"
        radius="md"
        w={size}
        h={size}
        pos="relative"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: onClick ? 'pointer' : 'default',
          ...(runBgColor ? { backgroundColor: runBgColor } : {}),
        }}
        onClick={onClick}
      >
        {hasInput && (
          <Handle
            type="target"
            position={Position.Left}
            style={{ cursor: 'default' }}
          />
        )}

        <Box style={{ verticalAlign: 'middle', color: iconColor }}>
          <Icon size={50} />
        </Box>

        {showBorder && (
          <Box
            pos="absolute"
            style={getBorderStyle(borderPosition, theme, borderColor)}
          />
        )}

        {outputHandles.length > 0 &&
          outputHandles.map((handle, index) => {
            const total = outputHandles.length
            const minTop = 25
            const maxTop = 75
            const topPercent =
              total === 1
                ? 50
                : minTop + ((maxTop - minTop) / (total - 1)) * index
            const showLabel = handle.label && total > 1

            return (
              <React.Fragment key={handle.id}>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={handle.id}
                  style={{
                    top: `${topPercent}%`,
                    cursor: 'default',
                  }}
                />
                {showLabel && (
                  <Text
                    size="10px"
                    c="dimmed"
                    pos="absolute"
                    style={{
                      right: -4,
                      top: `${topPercent}%`,
                      transform: 'translate(100%, -50%)',
                      whiteSpace: 'nowrap',
                      backgroundColor: 'var(--mantine-color-body)',
                      padding: '2px 5px',
                      borderRadius: 2,
                    }}
                  >
                    {handle.label}
                  </Text>
                )}
              </React.Fragment>
            )
          })}
      </Paper>
      {(label || subtitle) && (
        <Box
          style={{
            position: 'absolute',
            top: size + 4,
            left: '50%',
            transform: 'translateX(-50%)',
            textAlign: 'center',
            width: size * 2,
          }}
        >
          {label && (
            <Text
              size="sm"
              fw={600}
              c={highlightIconColor || (labelDimmed ? 'dimmed' : undefined)}
            >
              {label}
            </Text>
          )}
          {subtitle && (
            <Text size="xs" c="dimmed">
              {subtitle}
            </Text>
          )}
        </Box>
      )}
    </Box>
  )
}
