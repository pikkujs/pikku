import React from "react";
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "reactflow";

export const ElkEdge: React.FunctionComponent<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  label,
  labelStyle,
  labelBgStyle,
  style,
  markerEnd,
}) => {
  const bendPoints: { x: number; y: number }[] = data?.bendPoints || [];

  const points = [
    { x: sourceX, y: sourceY },
    ...bendPoints,
    { x: targetX, y: targetY },
  ];

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const midIndex = Math.floor(points.length / 2);
  const labelX = points[midIndex]?.x ?? (sourceX + targetX) / 2;
  const labelY = points[midIndex]?.y ?? (sourceY + targetY) / 2;

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
              fontSize: 10,
              fontFamily: "monospace",
              color: "#666",
              backgroundColor: "rgba(255, 255, 255, 0.8)",
              padding: "1px 4px",
              borderRadius: 3,
              ...labelStyle,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
