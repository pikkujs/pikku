import React, { useState, useMemo } from "react";
import {
  Box,
  Stack,
  Text,
  Group,
  TextInput,
  SegmentedControl,
  Center,
  Loader,
} from "@mantine/core";
import { Search } from "lucide-react";
import { Tree } from "@/components/ui/Tree";
import { CategoryRow } from "@/components/project/tree/CategoryRow";
import { PanelProvider } from "@/context/PanelContext";
import { ResizablePanelLayout } from "@/components/layout/ResizablePanelLayout";

interface TreeNode {
  id: string;
  name: string;
  children?: TreeNode[];
  type: "category" | "function" | "wiring";
  data?: any;
  functionName?: string;
  wireType?: string;
}

interface FilterOption {
  value: string;
  label: string;
}

interface ListExplorerPageProps {
  header?: React.ReactNode;
  title: string;
  totalCount?: number;
  searchPlaceholder?: string;
  emptyMessage?: string;
  data: TreeNode[];
  loading?: boolean;
  filters?: FilterOption[];
  filterKey?: string;
  filterValue?: string;
  onFilterChange?: (value: string) => void;
  renderRow: (node: any) => React.ReactNode;
  rowHeight?: number;
  nestedIndent?: number;
  useStickyCategories?: boolean;
  panelMessage?: string;
}

const filterTreeNode = (
  node: TreeNode,
  query: string
): TreeNode | null => {
  if (!query) return node;

  const nameMatches = node.name.toLowerCase().includes(query);
  const functionNameMatches = node.functionName?.toLowerCase().includes(query);

  if (node.children) {
    const filteredChildren = node.children
      .map((child) => filterTreeNode(child, query))
      .filter((child): child is TreeNode => child !== null);

    if (filteredChildren.length > 0 || nameMatches) {
      return { ...node, children: filteredChildren };
    }
  }

  if (nameMatches || functionNameMatches) {
    return node;
  }

  return null;
};

export const ListExplorerPage: React.FunctionComponent<ListExplorerPageProps> = ({
  header,
  title,
  totalCount,
  searchPlaceholder = "Search...",
  emptyMessage = "No items found.",
  data,
  loading = false,
  filters,
  filterValue,
  onFilterChange,
  renderRow,
  rowHeight = 60,
  nestedIndent = 16,
  useStickyCategories = true,
  panelMessage,
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredData = useMemo(() => {
    const query = searchQuery.toLowerCase();
    if (!query) return data;
    return data
      .map((node) => filterTreeNode(node, query))
      .filter((node): node is TreeNode => node !== null);
  }, [data, searchQuery]);

  if (loading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={header}
        emptyPanelMessage={panelMessage || `Select an item to see its details`}
      >
        <Stack
          gap={0}
          style={{ height: "100%" }}
        >
          <Box px="md" py="sm" style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}>
            <Group gap="md" wrap="nowrap">
              <TextInput
                placeholder={searchPlaceholder}
                leftSection={<Search size={16} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ flex: 1 }}
              />
              {filters && filters.length > 0 && onFilterChange && (
                <SegmentedControl
                  data={filters}
                  value={filterValue || "all"}
                  onChange={onFilterChange}
                  size="xs"
                />
              )}
            </Group>
          </Box>
          <Box style={{ flex: 1, overflow: "hidden", position: "relative" }}>
            {filteredData.length === 0 ? (
              <Box p="xl">
                <Text c="dimmed" ta="center">
                  {searchQuery
                    ? `No results found for "${searchQuery}"`
                    : emptyMessage}
                </Text>
              </Box>
            ) : (
              <Tree
                data={filteredData as any[]}
                rowHeight={rowHeight}
                nestedIndent={nestedIndent}
                defaultCollapsed
                isSticky={(item) =>
                  useStickyCategories &&
                  item.node.type === "category" &&
                  item.depth === 0
                }
                renderRow={(node, isCollapsed, hasChildren, toggle) => {
                  if (node.type === "category") {
                    return (
                      <CategoryRow
                        name={node.name}
                        childrenCount={node.children?.length || 0}
                        isCollapsed={isCollapsed}
                        hasChildren={hasChildren}
                        onToggle={toggle}
                      />
                    );
                  }
                  return renderRow(node);
                }}
              />
            )}
          </Box>
        </Stack>
      </ResizablePanelLayout>
    </PanelProvider>
  );
};
