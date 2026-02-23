import React from "react";
import { Allotment } from "allotment";
import { Box } from "@mantine/core";
import { PanelContainer } from "../panel/PanelContainer";
import { usePanelContext } from "@/context/PanelContext";

interface ResizablePanelLayoutProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  minSize?: number;
  emptyPanelMessage?: string;
  showTabs?: boolean;
  hidePanel?: boolean;
}

export const ResizablePanelLayout: React.FunctionComponent<
  ResizablePanelLayoutProps
> = ({ children, header, minSize = 200, emptyPanelMessage, showTabs = false, hidePanel = false }) => {
  const { panels } = usePanelContext();
  const alwaysVisible = !showTabs;
  const showPanel = !hidePanel && (alwaysVisible || panels.size !== 0);

  return (
    <Box style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {header}
      <Box style={{ flex: 1, minHeight: 0 }}>
        <Allotment key={showPanel ? "with-panel" : "no-panel"} defaultSizes={[840, 400]}>
          <Allotment.Pane maxSize={showPanel ? 1024 : undefined}>
            <Box style={{ height: "100%", overflow: "auto" }}>{children}</Box>
          </Allotment.Pane>
          <Allotment.Pane visible={showPanel} minSize={minSize} preferredSize={400}>
            <Box style={{ height: "100%", overflow: "auto" }}>
              <PanelContainer showTabs={showTabs} emptyMessage={emptyPanelMessage} />
            </Box>
          </Allotment.Pane>
        </Allotment>
      </Box>
    </Box>
  );
};
