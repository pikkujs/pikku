import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Group, Text, Popover, TextInput, Stack, UnstyledButton, ScrollArea, Box } from "@mantine/core";
import { Search, ChevronDown, Check, ExternalLink } from "lucide-react";

interface SwitcherItem {
  name: string;
  description?: string;
}

interface DetailPageHeaderProps {
  icon: React.ComponentType<{ size?: number }>;
  category: string;
  docsHref: string;
  categoryPath?: string;
  currentItem?: string;
  items?: SwitcherItem[];
  onItemSelect?: (name: string) => void;
  subtitle?: React.ReactNode;
  tabs?: React.ReactNode;
  rightSection?: React.ReactNode;
}

export const DetailPageHeader: React.FunctionComponent<DetailPageHeaderProps> = ({
  icon: Icon,
  category,
  docsHref,
  categoryPath,
  currentItem,
  items,
  onItemSelect,
  subtitle,
  tabs,
  rightSection,
}) => {
  const [opened, setOpened] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!items) return [];
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q)
    );
  }, [items, search]);

  const handleSelect = (name: string) => {
    setOpened(false);
    setSearch("");
    onItemSelect?.(name);
  };

  return (
    <Group
      gap="xs"
      px="md"
      h={50}
      style={{
        zIndex: 9999,
        borderBottom: "1px solid var(--mantine-color-default-border)",
        backgroundColor: "var(--mantine-color-body)",
        flexShrink: 0,
      }}
    >
      <Icon size={16} />
      {categoryPath ? (
        <Link to={categoryPath} style={{ textDecoration: "none" }}>
          <Text size="md" c="dimmed">{category}</Text>
        </Link>
      ) : (
        <Text size="md" fw={currentItem ? 400 : 500} c={currentItem ? "dimmed" : undefined}>{category}</Text>
      )}

      {currentItem && items && onItemSelect && (
        <>
          <Text size="md" c="dimmed">/</Text>
          <Popover
            opened={opened}
            onChange={setOpened}
            width={300}
            position="bottom-start"
            shadow="md"
            zIndex={10000}
          >
            <Popover.Target>
              <UnstyledButton
                onClick={() => setOpened((o) => !o)}
                style={{ display: "flex", alignItems: "center", gap: 4 }}
              >
                <Text size="md" fw={500}>{currentItem}</Text>
                <ChevronDown size={14} />
              </UnstyledButton>
            </Popover.Target>
            <Popover.Dropdown p={0}>
              <TextInput
                placeholder={`Search ${category.toLowerCase()}...`}
                leftSection={<Search size={14} />}
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                styles={{
                  input: { border: "none", borderBottom: "1px solid var(--mantine-color-default-border)", borderRadius: 0 },
                }}
              />
              <ScrollArea.Autosize mah={300}>
                <Stack gap={0}>
                  {filtered.map((item) => (
                    <UnstyledButton
                      key={item.name}
                      onClick={() => handleSelect(item.name)}
                      py="xs"
                      px="sm"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        backgroundColor: item.name === currentItem ? "var(--mantine-color-green-light)" : undefined,
                      }}
                    >
                      {item.name === currentItem && <Check size={14} color="var(--mantine-color-green-6)" />}
                      <div style={{ marginLeft: item.name === currentItem ? 0 : 22 }}>
                        <Text size="sm" fw={item.name === currentItem ? 500 : 400}>{item.name}</Text>
                        {item.description && <Text size="xs" c="dimmed">{item.description}</Text>}
                      </div>
                    </UnstyledButton>
                  ))}
                  {filtered.length === 0 && (
                    <Text size="sm" c="dimmed" ta="center" py="md">No results</Text>
                  )}
                </Stack>
              </ScrollArea.Autosize>
            </Popover.Dropdown>
          </Popover>
        </>
      )}

      {subtitle}

      {tabs && <Box ml="md">{tabs}</Box>}

      <Group ml="auto" gap="sm">
        {rightSection}
        <a
          href={docsHref}
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 6, color: "var(--mantine-color-dimmed)" }}
        >
          <ExternalLink size={14} />
          <Text size="sm" c="dimmed">{category} documentation</Text>
        </a>
      </Group>
    </Group>
  );
};
