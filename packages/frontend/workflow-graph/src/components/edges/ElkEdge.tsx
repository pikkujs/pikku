import React from 'react'
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react'

type Point = { x: number; y: number }

const CORNER = 8

function roundedPath(points: Point[]): string {
  let path = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const next = points[i + 1]
    const r = Math.min(
      CORNER,
      Math.hypot(curr.x - prev.x, curr.y - prev.y) / 2,
      Math.hypot(next.x - curr.x, next.y - curr.y) / 2
    )
    const inDx = Math.sign(curr.x - prev.x)
    const inDy = Math.sign(curr.y - prev.y)
    const outDx = Math.sign(next.x - curr.x)
    const outDy = Math.sign(next.y - curr.y)
    path += ` L ${curr.x - inDx * r} ${curr.y - inDy * r}`
    path += ` Q ${curr.x} ${curr.y} ${curr.x + outDx * r} ${curr.y + outDy * r}`
  }
  const last = points[points.length - 1]
  return `${path} L ${last.x} ${last.y}`
}

export const ElkEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  label,
  labelStyle,
  style,
  markerEnd,
}) => {
  const points = (data?.points as Point[] | undefined) ?? [
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
  ]

  const labelAt = data?.labelAt as Point | undefined
  const anchor = points[Math.max(0, points.length - 2)]
  const labelX = labelAt?.x ?? anchor.x + 8
  const labelY = labelAt?.y ?? anchor.y - 22

  return (
    <>
      <BaseEdge
        id={id}
        path={roundedPath(points)}
        style={style}
        markerEnd={markerEnd}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
              fontSize: 11,
              lineHeight: '16px',
              fontFamily: 'var(--theme-font-mono, ui-monospace, monospace)',
              color: 'var(--muted-foreground)',
              background: 'var(--background)',
              border: '1px solid var(--border)',
              padding: '0 6px',
              boxSizing: 'border-box',
              height: 18,
              borderRadius: 4,
              whiteSpace: 'nowrap',
              ...labelStyle,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
