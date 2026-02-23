import React, { useState, useCallback, useRef, useEffect } from "react";
import { Allotment } from "allotment";
import { Box, ActionIcon, Tooltip } from "@mantine/core";
import { PanelLeftOpen, PanelRightOpen } from "lucide-react";
import { PanelContainer } from "../panel/PanelContainer";
import { usePanelContext } from "@/context/PanelContext";

const CollapsedSidebar: React.FunctionComponent<{
  side: "left" | "right";
  onExpand: () => void;
}> = ({ side, onExpand }) => {
  const Icon = side === "left" ? PanelLeftOpen : PanelRightOpen;
  return (
    <Box
      style={{
        width: 36,
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRight: side === "left" ? "1px solid var(--mantine-color-default-border)" : undefined,
        borderLeft: side === "right" ? "1px solid var(--mantine-color-default-border)" : undefined,
        background: "var(--mantine-color-body)",
        flexShrink: 0,
      }}
    >
      <Tooltip label="Expand" position={side === "left" ? "right" : "left"}>
        <ActionIcon variant="subtle" size="sm" color="gray" onClick={onExpand}>
          <Icon size={16} />
        </ActionIcon>
      </Tooltip>
    </Box>
  );
};

interface ThreePaneLayoutProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  runsPanel?: React.ReactNode;
  runsPanelVisible?: boolean;
  emptyPanelMessage?: string;
  showTabs?: boolean;
  hidePanel?: boolean;
}

export const ThreePaneLayout: React.FunctionComponent<ThreePaneLayoutProps> = ({
  children,
  header,
  runsPanel,
  runsPanelVisible = true,
  emptyPanelMessage,
  showTabs = false,
  hidePanel = false,
}) => {
  const { panels } = usePanelContext();
  const alwaysVisible = !showTabs;

  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const prevRunsPanelVisible = useRef(runsPanelVisible);
  useEffect(() => {
    if (!prevRunsPanelVisible.current && runsPanelVisible) {
      setLeftCollapsed(false);
    }
    prevRunsPanelVisible.current = runsPanelVisible;
  }, [runsPanelVisible]);

  const hasLeftPane = !!runsPanel && runsPanelVisible;
  const leftVisible = hasLeftPane && !leftCollapsed;

  const hasRightPane = !hidePanel && (alwaysVisible || panels.size !== 0);
  const rightVisible = hasRightPane && !rightCollapsed;

  const handleVisibleChange = useCallback((index: number, visible: boolean) => {
    if (hasLeftPane && index === 0) {
      setLeftCollapsed(!visible);
    }
    const rightIndex = hasLeftPane ? 2 : 1;
    if (hasRightPane && index === rightIndex) {
      setRightCollapsed(!visible);
    }
  }, [hasLeftPane, hasRightPane]);

  return (
    <Box style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {header}
      <Box style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "row" }}>
        {hasLeftPane && leftCollapsed && (
          <CollapsedSidebar side="left" onExpand={() => setLeftCollapsed(false)} />
        )}
        <Box style={{ flex: 1, minWidth: 0, height: "100%" }}>
          <Allotment
            key={`${hasLeftPane}-${hasRightPane}`}
            defaultSizes={
              hasLeftPane && hasRightPane ? [220, 640, 400] :
              hasLeftPane ? [220, 840] :
              hasRightPane ? [840, 400] :
              undefined
            }
            onVisibleChange={handleVisibleChange}
          >
            {hasLeftPane && (
              <Allotment.Pane
                visible={leftVisible}
                snap
                minSize={180}
                preferredSize={220}
                maxSize={300}
              >
                <Box style={{ height: "100%", overflow: "auto", borderRight: "1px solid var(--mantine-color-default-border)" }}>
                  {runsPanel}
                </Box>
              </Allotment.Pane>
            )}
            <Allotment.Pane>
              <Box style={{ height: "100%", overflow: "auto" }}>{children}</Box>
            </Allotment.Pane>
            {hasRightPane && (
              <Allotment.Pane
                visible={rightVisible}
                snap
                minSize={200}
                preferredSize={400}
              >
                <Box style={{ height: "100%", overflow: "auto" }}>
                  <PanelContainer showTabs={showTabs} emptyMessage={emptyPanelMessage} />
                </Box>
              </Allotment.Pane>
            )}
          </Allotment>
        </Box>
        {hasRightPane && rightCollapsed && (
          <CollapsedSidebar side="right" onExpand={() => setRightCollapsed(false)} />
        )}
      </Box>
    </Box>
  );
};
