import React from "react";
import { Node, NodeProps } from "reactflow";
import { SimpleGrid, Box } from "@mantine/core";
import { PikkuBadge } from "@/components/ui/PikkuBadge";
import { RotateCw, Timer, Code } from "lucide-react";
import { BaseNode } from "./BaseNode";
import { usePanelContext } from "@/context/PanelContext";

interface InlineNodeData {
  icon: React.ComponentType<{ size?: number }>;
  colorKey: string;
  title: string;
  description?: string;
  inWorkflow?: boolean;
  onClick?: () => void;
  workflowRetries?: number;
  workflowRetryDelay?: number;
}

export const InlineNode: React.FunctionComponent<NodeProps<InlineNodeData>> = ({
  data,
  id,
}) => {
  const { openWorkflowStep } = usePanelContext();

  const handleClick = React.useCallback(() => {
    openWorkflowStep(id, "inline");
  }, [id, openWorkflowStep]);

  return (
    <BaseNode
      data={{
        ...data,
        onClick: handleClick,
      }}
      hasInput={true}
      hasOutput={true}
      width={200}
      additionalBody={
        data.inWorkflow ? (
          <SimpleGrid
            cols={2}
            px="1rem"
            c="gray.7"
            mt="xs"
            style={{ alignItems: "center" }}
          >
            <Box pos="relative" style={{ justifySelf: "center" }}>
              <RotateCw size={16} strokeWidth={2} />
              {data.workflowRetries !== undefined &&
                data.workflowRetries > 0 && (
                  <PikkuBadge
                    type="label"
                    size="xs"
                    pos="absolute"
                    top={-8}
                    right={-8}
                    circle
                    style={{
                      minWidth: 12,
                      height: 12,
                      padding: 2,
                      width: "fit-content",
                    }}
                  >
                    {data.workflowRetries}
                  </PikkuBadge>
                )}
            </Box>

            <Box pos="relative" style={{ justifySelf: "center" }}>
              <Timer size={16} strokeWidth={2} />
              {data.workflowRetryDelay !== undefined &&
                data.workflowRetryDelay > 0 && (
                  <PikkuBadge
                    type="label"
                    size="xs"
                    pos="absolute"
                    top={-8}
                    right={-8}
                    circle
                    style={{
                      minWidth: 12,
                      height: 12,
                      padding: 2,
                      width: "fit-content",
                    }}
                  >
                    {data.workflowRetryDelay}
                  </PikkuBadge>
                )}
            </Box>
          </SimpleGrid>
        ) : undefined
      }
    />
  );
};

export const getInlineNodeConfig = (
  id: string,
  position: { x: number; y: number },
  step: any
): Node => {
  return {
    id,
    type: "inlineNode",
    position,
    data: {
      icon: Code,
      colorKey: "workflow",
      title: "Inline",
      description: step.stepName,
      inWorkflow: true,
      workflowRetries: step.options?.retries,
      workflowRetryDelay:
        typeof step.options?.retryDelay === "number"
          ? step.options.retryDelay
          : undefined,
      nodeType: "internal",
    },
  };
};
