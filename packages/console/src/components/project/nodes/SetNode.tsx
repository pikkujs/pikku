import React from "react";
import { Node, NodeProps } from "reactflow";
import { FlowNode } from "./FlowNode";
import { Pencil } from "lucide-react";
import { usePanelContext } from "@/context/PanelContext";
import { useWorkflowContextSafe } from "@/context/WorkflowContext";

interface SetNodeData {
  colorKey: string;
  variable?: string;
  stepName?: string;
}

type HighlightType = "focused" | "referenced" | null;

export const SetNode: React.FunctionComponent<NodeProps<SetNodeData>> = ({
  data,
  id,
}) => {
  const { openWorkflowStep } = usePanelContext();
  const workflowContext = useWorkflowContextSafe();

  const highlightType: HighlightType = React.useMemo(() => {
    if (!workflowContext) return null;
    if (workflowContext.focusedNodeId === id) return "focused";
    if (workflowContext.referencedNodeId === id) return "referenced";
    return null;
  }, [workflowContext, id]);

  const handleClick = React.useCallback(() => {
    openWorkflowStep(id, "set");
  }, [id, openWorkflowStep]);

  return (
    <FlowNode
      icon={Pencil}
      colorKey={data.colorKey}
      hasInput={true}
      outputHandles={[{ id: "default", label: "" }]}
      size={80}
      label="Set"
      subtitle={data.stepName}
      onClick={handleClick}
      showBorder={false}
      highlightType={highlightType}
      nodeId={id}
    />
  );
};

export const getSetNodeConfig = (
  id: string,
  position: { x: number; y: number },
  step: any
): Node => {
  return {
    id,
    type: "setNode",
    position,
    data: {
      colorKey: "workflow",
      variable: step.variable,
      stepName: step.stepName,
      nodeType: "flow",
    },
  };
};
