import React from "react";
import { Group, Stack, Text, ActionIcon } from "@mantine/core";
import { ChevronRight, ChevronDown } from "lucide-react";

interface CategoryRowProps {
  name: string;
  childrenCount: number;
  isCollapsed?: boolean;
  hasChildren?: boolean;
  onToggle?: () => void;
}

export const CategoryRow: React.FunctionComponent<CategoryRowProps> = ({
  name,
  childrenCount,
  isCollapsed = false,
  hasChildren = false,
  onToggle,
}) => {
  return (
    <Group
      gap="md"
      wrap="nowrap"
      p="md"
      style={{
        height: '100%',
      }}
    >
      {hasChildren && onToggle ? (
        <ActionIcon variant="subtle" size="sm" onClick={onToggle}>
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </ActionIcon>
      ) : (
        <div style={{ width: 22 }} />
      )}
      <Stack gap={0} style={{ flex: 1 }}>
        <Group gap="xs">
          <Text fw={600} size="md">
            {name}
          </Text>
          <Text size="sm" c="dimmed">
            ({childrenCount})
          </Text>
        </Group>
      </Stack>
    </Group>
  );
};
