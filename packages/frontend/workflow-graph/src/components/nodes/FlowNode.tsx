import React from 'react'
import { asI18n } from '@pikku/react'
import { Handle, Position } from '@xyflow/react'
import { useGraphRun } from '../../context/GraphHostContext'
import { nodeColor } from '../../colors'
import { useFlowDirection } from '../../context/FlowDirectionContext'

interface OutputHandle {
  id: string
  label?: string
}

type BorderPosition = 'left' | 'right' | 'top'

type HighlightType = 'focused' | 'referenced' | null

// Workflow run-status colors are exposed as CSS variables so a host theme
// (e.g. fabric) can override them, while the `var(..., fallback)` keeps the
// default palette working without importing any extra stylesheet.
const runStatusColors: Record<string, string> = {
  succeeded: 'var(--pikku-status-succeeded, oklch(0.8 0.15 150))',
  failed: 'var(--pikku-status-failed, oklch(0.75 0.16 25))',
  running: 'var(--pikku-status-running, oklch(0.75 0.13 250))',
  scheduled: 'var(--pikku-status-scheduled, oklch(0.8 0.15 60))',
  pending: 'var(--pikku-status-pending, var(--muted-foreground))',
  suspended: 'var(--pikku-status-suspended, oklch(0.88 0.15 100))',
  cancelled: 'var(--pikku-status-cancelled, var(--muted-foreground))',
  skipped: 'var(--pikku-status-skipped, var(--muted-foreground))',
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

const getBorderStyle = (position: BorderPosition, borderColor?: string) => {
  const color = borderColor || 'var(--muted-foreground)'
  const radius = 'var(--radius)'

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

const getHighlightIconColor = (highlightType: HighlightType): string | null => {
  if (!highlightType) return null
  if (highlightType === 'focused') return 'var(--primary)'
  return 'var(--pikku-node-referenced, var(--chart-2))'
}

export const FlowNode: React.FC<FlowNodeProps> = ({
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
  const vertical = useFlowDirection() === 'DOWN'
  const highlightIconColor = getHighlightIconColor(highlightType)
  const run = useGraphRun()

  const runStatus = React.useMemo(() => {
    if (!run?.runId || !nodeId) return null
    const stepState = run.stepStates.get(nodeId)
    let status = stepState?.status
    if (
      !status &&
      !hasInput &&
      run.stepStates.size === 0 &&
      run.status === 'failed'
    ) {
      status = 'failed'
    }
    return status ?? null
  }, [run?.runId, run?.stepStates, run?.status, nodeId, hasInput])

  const runBgColor = runStatus ? (runStatusColors[runStatus] ?? null) : null

  const iconColor =
    highlightIconColor || (runBgColor ? 'white' : nodeColor(colorKey))

  return (
    <div
      className="overflow-visible"
      style={{ width: size }}
      data-testid="workflow-node"
      data-node-id={nodeId}
      data-node-status={runStatus ?? 'none'}
    >
      <div
        className={`relative flex items-center justify-center rounded-md border bg-card shadow-md ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
        style={{
          width: size,
          height: size,
          ...(runBgColor ? { background: runBgColor } : {}),
        }}
        onClick={onClick}
      >
        {hasInput && (
          <Handle
            type="target"
            position={vertical ? Position.Top : Position.Left}
            style={{ cursor: 'default' }}
          />
        )}

        <div style={{ color: iconColor }}>
          <Icon size={Math.round(size * 0.6)} />
        </div>

        {showBorder && (
          <div
            className="absolute"
            style={getBorderStyle(borderPosition, borderColor)}
          />
        )}

        {outputHandles.length > 0 &&
          outputHandles.map((handle, index) => {
            const total = outputHandles.length
            const minOffset = 25
            const maxOffset = 75
            const offsetPercent =
              total === 1
                ? 50
                : minOffset + ((maxOffset - minOffset) / (total - 1)) * index
            const showLabel = handle.label && total > 1

            return (
              <React.Fragment key={handle.id}>
                <Handle
                  type="source"
                  position={vertical ? Position.Bottom : Position.Right}
                  id={handle.id}
                  style={{
                    ...(vertical
                      ? { left: `${offsetPercent}%` }
                      : { top: `${offsetPercent}%` }),
                    cursor: 'default',
                  }}
                />
                {showLabel && (
                  <span
                    className="absolute whitespace-nowrap rounded-sm bg-background px-[5px] py-0.5 text-[10px] text-muted-foreground"
                    style={{
                      ...(vertical
                        ? {
                            bottom: -4,
                            left: `${offsetPercent}%`,
                            transform: 'translate(-50%, 100%)',
                          }
                        : {
                            right: -4,
                            top: `${offsetPercent}%`,
                            transform: 'translate(100%, -50%)',
                          }),
                    }}
                  >
                    {asI18n(handle.label!)}
                  </span>
                )}
              </React.Fragment>
            )
          })}
      </div>
      {(label || subtitle) && (
        <div
          className="absolute"
          style={
            vertical
              ? {
                  // vertical flow: outgoing edges leave the bottom, so hang the
                  // label beside the node instead of underneath it
                  left: size + 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  textAlign: 'left',
                  width: size * 2,
                }
              : {
                  top: size + 12,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  textAlign: 'center',
                  width: size * 2,
                }
          }
        >
          {label && (
            <div
              className={`text-sm font-semibold ${labelDimmed ? 'text-muted-foreground' : ''}`}
              style={
                highlightIconColor ? { color: highlightIconColor } : undefined
              }
            >
              {asI18n(label)}
            </div>
          )}
          {subtitle && (
            <div className="text-sm text-muted-foreground">
              {asI18n(subtitle)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
