import React from 'react'
import { asI18n } from '@pikku/react'
import { Handle, Position } from '@xyflow/react'
import { Lock, LockOpen, Shield, Layers } from 'lucide-react'
import { GraphBadge } from '../GraphBadge'
import { useFlowDirection } from '../../context/FlowDirectionContext'

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
  const vertical = useFlowDirection() === 'DOWN'

  return (
    <div
      className="relative rounded-md border bg-card text-card-foreground shadow-md"
      style={{ width }}
    >
      {inFlow && hasInput && (
        <Handle
          type="target"
          position={vertical ? Position.Top : Position.Left}
          style={{ cursor: 'default' }}
        />
      )}

      <div
        className={`nodrag p-3 ${data.onClick ? 'cursor-pointer' : 'cursor-default'}`}
        onClick={data.onClick}
      >
        <div className="flex flex-col gap-1">
          <span className="line-clamp-2 text-sm text-muted-foreground">
            {asI18n(data.title)}
          </span>
          {data.description && (
            <span className="font-mono text-sm font-medium">
              {asI18n(data.description)}
            </span>
          )}

          {data.tags && data.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {data.tags.map((tag) => (
                <GraphBadge
                  key={tag}
                  type="dynamic"
                  badge="tag"
                  value={tag}
                  size="sm"
                  color={data.colorKey}
                />
              ))}
            </div>
          )}

          {!hideMetadataIndicators &&
            (data.auth !== undefined ||
              (data.permissionsCount && data.permissionsCount > 0) ||
              (data.middlewareCount && data.middlewareCount > 0)) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {data.auth !== undefined &&
                  (data.auth ? (
                    <Lock size={12} strokeWidth={2} />
                  ) : (
                    <LockOpen size={12} strokeWidth={2} />
                  ))}

                {data.permissionsCount !== undefined &&
                  data.permissionsCount > 0 && (
                    <div className="flex items-center gap-1">
                      <Shield size={12} strokeWidth={2} />
                      <span className="text-sm font-medium">
                        {asI18n(String(data.permissionsCount))}
                      </span>
                    </div>
                  )}

                {data.middlewareCount !== undefined &&
                  data.middlewareCount > 0 && (
                    <div className="flex items-center gap-1">
                      <Layers size={12} strokeWidth={2} />
                      <span className="text-sm font-medium">
                        {asI18n(String(data.middlewareCount))}
                      </span>
                    </div>
                  )}
              </div>
            )}

          {additionalBody}
        </div>
      </div>

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
                <div
                  key={handle.id}
                  className="absolute"
                  style={{
                    ...(vertical ? { bottom: -12 } : { right: -12 }),
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
                  <span className="font-mono text-sm font-medium text-muted-foreground">
                    {asI18n(handle.label || handle.id)}
                  </span>
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
                </div>
              )
            })
          : hasOutput && (
              <Handle
                type="source"
                position={vertical ? Position.Bottom : Position.Right}
                style={{ cursor: 'default' }}
              />
            ))}
    </div>
  )
}
