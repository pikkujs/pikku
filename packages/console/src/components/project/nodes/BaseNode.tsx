import React from "react";
import {
  Box,
  Group,
  Paper,
  Stack,
  Text,
  useMantineTheme,
} from "@mantine/core";
import { Handle, Position } from "reactflow";
import { Lock, LockOpen, Shield, Layers } from "lucide-react";
import { PikkuBadge } from "@/components/ui/PikkuBadge";

interface OutputHandle {
  id: string;
  label?: string;
}

interface BaseNodeProps {
  data: {
    colorKey: string;
    title: string;
    description?: string;
    tags?: string[];
    auth?: boolean;
    permissionsCount?: number;
    middlewareCount?: number;
    onClick?: () => void;
  };
  hasInput?: boolean;
  hasOutput?: boolean;
  outputHandles?: OutputHandle[];
  additionalBody?: React.ReactNode;
  width?: number;
  hideMetadataIndicators?: boolean;
  inFlow?: boolean;
}

export const BaseNode: React.FunctionComponent<BaseNodeProps> = ({
  data,
  hasInput = false,
  hasOutput = true,
  outputHandles,
  additionalBody,
  width = 200,
  hideMetadataIndicators = false,
  inFlow = true,
}) => {
  const theme = useMantineTheme();

  return (
    <Paper shadow="md" radius="md" w={width} pos="relative">
      {inFlow && hasInput && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ cursor: "default" }}
        />
      )}


      <Box
        p="sm"
        className="nodrag"
        style={{ cursor: data.onClick ? "pointer" : "default" }}
        onClick={data.onClick}
      >
        <Stack gap={4}>
          <Text size="xs" c="dimmed" lineClamp={2}>
            {data.title}
          </Text>
          {data.description && (
            <Text size="xs" ff="monospace" fw={500}>
              {data.description}
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
                  size="xs"
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
                      <Text size="xs" fw={500}>
                        {data.permissionsCount}
                      </Text>
                    </Group>
                  )}

                {data.middlewareCount !== undefined &&
                  data.middlewareCount > 0 && (
                    <Group gap={4}>
                      <Layers size={12} strokeWidth={2} />
                      <Text size="xs" fw={500}>
                        {data.middlewareCount}
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
              const total = outputHandles.length;
              const minTop = 25;
              const maxTop = 75;
              const topPercent = total === 1
                ? 50
                : minTop + ((maxTop - minTop) / (total - 1)) * index;

              return (
                <Box
                  key={handle.id}
                  pos="absolute"
                  right={-12}
                  style={{
                    top: `${topPercent}%`,
                    transform: "translateY(-50%)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <Text size="xs" c="dimmed" ff="monospace" fw={500}>
                    {handle.label || handle.id}
                  </Text>
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={handle.id}
                    style={{
                      position: "relative",
                      right: 0,
                      transform: "none",
                      cursor: "default",
                    }}
                  />
                </Box>
              );
            })
          : hasOutput && (
              <Handle
                type="source"
                position={Position.Right}
                style={{ cursor: "default" }}
              />
            ))}
    </Paper>
  );
};
