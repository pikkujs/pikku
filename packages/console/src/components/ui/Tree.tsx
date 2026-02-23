import React, { useRef, useState, useCallback } from "react";
import { Box, useMantineTheme } from "@mantine/core";
import { useVirtualizer, defaultRangeExtractor, Range } from "@tanstack/react-virtual";

interface TreeNode {
  id: string;
  children?: TreeNode[];
  [key: string]: any;
}

interface FlattenedNode {
  node: TreeNode;
  depth: number;
  parentId: string | null;
  isCollapsed: boolean;
  hasChildren: boolean;
}

interface TreeProps {
  data: TreeNode[];
  rowHeight: number;
  nestedIndent: number;
  renderRow: (node: TreeNode, isCollapsed: boolean, hasChildren: boolean, toggle: () => void) => React.ReactNode;
  isSticky: (item: FlattenedNode, index: number) => boolean;
  defaultCollapsed?: boolean;
}

const flattenTree = (
  nodes: TreeNode[],
  collapsedIds: Set<string>,
  depth: number = 0,
  parentId: string | null = null
): FlattenedNode[] => {
  const result: FlattenedNode[] = [];

  for (const node of nodes) {
    const hasChildren = !!(node.children && node.children.length > 0);
    const isCollapsed = collapsedIds.has(node.id);

    result.push({
      node,
      depth,
      parentId,
      isCollapsed,
      hasChildren,
    });

    if (hasChildren && !isCollapsed) {
      result.push(...flattenTree(node.children!, collapsedIds, depth + 1, node.id));
    }
  }

  return result;
};

const collectCategoryIds = (nodes: TreeNode[]): string[] => {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      ids.push(node.id);
      ids.push(...collectCategoryIds(node.children));
    }
  }
  return ids;
};

export const Tree: React.FunctionComponent<TreeProps> = ({ data, rowHeight, nestedIndent, renderRow, isSticky, defaultCollapsed = false }) => {
  const theme = useMantineTheme();
  const parentRef = useRef<HTMLDivElement>(null);
  const activeStickyIndexRef = useRef(0);

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => {
    if (defaultCollapsed) {
      return new Set(collectCategoryIds(data));
    }
    return new Set();
  });

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const flattenedData = React.useMemo(
    () => flattenTree(data, collapsedIds),
    [data, collapsedIds]
  );

  const stickyIndexes = React.useMemo(
    () => flattenedData
      .map((item, index) => isSticky(item, index) ? index : -1)
      .filter(index => index !== -1),
    [flattenedData, isSticky]
  );

  const isStickyIndex = (index: number) => stickyIndexes.includes(index);

  const isActiveSticky = (index: number) =>
    stickyIndexes.length > 0 && activeStickyIndexRef.current === index;

  const virtualizer = useVirtualizer({
    count: flattenedData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 5,
    rangeExtractor: React.useCallback(
      (range: Range) => {
        if (stickyIndexes.length === 0) {
          return defaultRangeExtractor(range);
        }

        activeStickyIndexRef.current =
          [...stickyIndexes]
            .reverse()
            .find((index) => range.startIndex >= index) ?? stickyIndexes[0];

        const next = new Set([
          activeStickyIndexRef.current,
          ...defaultRangeExtractor(range),
        ]);

        return [...next].sort((a, b) => a - b);
      },
      [stickyIndexes]
    ),
  });

  return (
    <Box
      ref={parentRef}
      style={{
        height: '100%',
        overflow: 'auto',
      }}
    >
      <Box
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const flatNode = flattenedData[virtualItem.index];
          const sticky = isStickyIndex(virtualItem.index);
          const activeSticky = isActiveSticky(virtualItem.index);

          return (
            <Box
              key={virtualItem.key}
              style={{
                ...(sticky
                  ? {
                      background: 'var(--mantine-color-body)',
                      zIndex: 1,
                    }
                  : {}),
                ...(activeSticky
                  ? {
                      position: 'sticky',
                    }
                  : {
                      position: 'absolute',
                      transform: `translateY(${virtualItem.start}px)`,
                    }),
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                paddingLeft: `${(flatNode.depth + 1) * nestedIndent}px`,
                borderBottom: `1px solid ${theme.colors.gray[2]}`,
              }}
            >
              {renderRow(
                flatNode.node,
                flatNode.isCollapsed,
                flatNode.hasChildren,
                () => toggleCollapse(flatNode.node.id)
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
