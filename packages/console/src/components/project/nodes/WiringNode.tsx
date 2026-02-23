import React from "react";
import { Node, NodeProps } from "reactflow";
import { FlowNode } from "./FlowNode";
import { Webhook, ListTodo, Terminal, Wrench, FileText, FolderOpen, Clock, Zap, LucideIcon } from "lucide-react";
import { usePanelContext } from "@/context/PanelContext";
import { useWorkflowContextSafe } from "@/context/WorkflowContext";
import { useWorkflowRunContextSafe } from "@/context/WorkflowRunContext";
import { useMantineTheme } from "@mantine/core";

type WiringType = "http" | "queue" | "cli" | "mcp-tool" | "mcp-prompt" | "mcp-resource" | "schedule" | "trigger";

const wiringTypeToWireType: Record<WiringType, string> = {
  http: "http",
  queue: "queue",
  cli: "cli",
  "mcp-tool": "mcp",
  "mcp-prompt": "mcp",
  "mcp-resource": "mcp",
  schedule: "scheduler",
  trigger: "trigger",
};

interface WiringNodeData {
  colorKey: string;
  triggerType: WiringType;
  label: string;
  wireId?: string;
  outputHandles: Array<{ id: string; label?: string }>;
}

const wiringIcons: Record<WiringType, LucideIcon> = {
  http: Webhook,
  queue: ListTodo,
  cli: Terminal,
  "mcp-tool": Wrench,
  "mcp-prompt": FileText,
  "mcp-resource": FolderOpen,
  schedule: Clock,
  trigger: Zap,
};

type HighlightType = "focused" | "referenced" | null;

export const WiringNode: React.FunctionComponent<NodeProps<WiringNodeData>> = ({
  data,
  id,
}) => {
  const { openWorkflowStep } = usePanelContext();
  const workflowContext = useWorkflowContextSafe();
  const runContext = useWorkflowRunContextSafe();
  const theme = useMantineTheme();

  const highlightType: HighlightType = React.useMemo(() => {
    if (!workflowContext) return null;
    if (workflowContext.focusedNodeId === id) return "focused";
    if (workflowContext.referencedNodeId === id) return "referenced";
    return null;
  }, [workflowContext, id]);

  const handleClick = React.useCallback(() => {
    openWorkflowStep(id, "trigger");
  }, [id, openWorkflowStep]);

  const icon = wiringIcons[data.triggerType] || Zap;

  const wiringTypeLabels: Record<string, string> = {
    http: "HTTP",
    queue: "Queue",
    cli: "CLI",
    "mcp-tool": "MCP Tool",
    "mcp-prompt": "MCP Prompt",
    "mcp-resource": "MCP Resource",
    schedule: "Schedule",
    trigger: "Trigger",
  };

  const typeLabel = wiringTypeLabels[data.triggerType] || "Trigger";

  const activeBorderColor = React.useMemo(() => {
    const wire = runContext?.runData?.wire;
    if (!wire) return undefined;
    const expectedWireType = wiringTypeToWireType[data.triggerType];
    if (wire.type !== expectedWireType) return undefined;
    if (data.wireId && wire.id) return wire.id === data.wireId ? theme.colors[data.colorKey]?.[5] : undefined;
    return theme.colors[data.colorKey]?.[5];
  }, [runContext?.runData?.wire, data.triggerType, data.wireId, data.colorKey, theme]);

  return (
    <FlowNode
      icon={icon}
      colorKey={data.colorKey}
      hasInput={false}
      outputHandles={data.outputHandles}
      size={80}
      label={typeLabel}
      subtitle={data.label !== typeLabel ? data.label : undefined}
      onClick={handleClick}
      borderPosition="left"
      borderColor={activeBorderColor}
      highlightType={highlightType}
      nodeId={id}
    />
  );
};

export const getHttpWiringNodeConfig = (
  id: string,
  position: { x: number; y: number },
  wire: { route?: string; method?: string; startNode?: string }
): Node => {
  const outputHandles: Array<{ id: string; label?: string }> = [];
  if (wire.startNode) {
    outputHandles.push({ id: "start", label: "" });
  }

  return {
    id,
    type: "wiringNode",
    position,
    data: {
      colorKey: "http",
      triggerType: "http",
      label: `${wire.method?.toUpperCase() || "GET"} ${wire.route || ""}`,
      wireId: `${wire.method?.toLowerCase() || "get"}:${wire.route || ""}`,
      outputHandles,
      nodeType: "wiring",
    },
  };
};

export const getQueueWiringNodeConfig = (
  id: string,
  position: { x: number; y: number },
  wire: { name?: string; startNode?: string }
): Node => {
  const outputHandles: Array<{ id: string; label?: string }> = [];
  if (wire.startNode) {
    outputHandles.push({ id: "start", label: "" });
  }

  return {
    id,
    type: "wiringNode",
    position,
    data: {
      colorKey: "queue",
      triggerType: "queue",
      label: wire.name || "Queue",
      wireId: wire.name,
      outputHandles,
      nodeType: "wiring",
    },
  };
};

export const getCliWiringNodeConfig = (
  id: string,
  position: { x: number; y: number },
  wire: { command?: string; startNode?: string }
): Node => {
  const outputHandles: Array<{ id: string; label?: string }> = [];
  if (wire.startNode) {
    outputHandles.push({ id: "start", label: "" });
  }

  return {
    id,
    type: "wiringNode",
    position,
    data: {
      colorKey: "cli",
      triggerType: "cli",
      label: wire.command || "CLI",
      wireId: wire.command,
      outputHandles,
      nodeType: "wiring",
    },
  };
};

export const getMcpToolWiringNodeConfig = (
  id: string,
  position: { x: number; y: number },
  wire: { name?: string; startNode?: string }
): Node => {
  const outputHandles: Array<{ id: string; label?: string }> = [];
  if (wire.startNode) {
    outputHandles.push({ id: "start", label: "" });
  }

  return {
    id,
    type: "wiringNode",
    position,
    data: {
      colorKey: "mcp",
      triggerType: "mcp-tool",
      label: wire.name || "MCP Tool",
      wireId: wire.name ? `tool:${wire.name}` : undefined,
      outputHandles,
      nodeType: "wiring",
    },
  };
};

export const getMcpPromptWiringNodeConfig = (
  id: string,
  position: { x: number; y: number },
  wire: { name?: string; startNode?: string }
): Node => {
  const outputHandles: Array<{ id: string; label?: string }> = [];
  if (wire.startNode) {
    outputHandles.push({ id: "start", label: "" });
  }

  return {
    id,
    type: "wiringNode",
    position,
    data: {
      colorKey: "mcp",
      triggerType: "mcp-prompt",
      label: wire.name || "MCP Prompt",
      wireId: wire.name ? `prompt:${wire.name}` : undefined,
      outputHandles,
      nodeType: "wiring",
    },
  };
};

export const getMcpResourceWiringNodeConfig = (
  id: string,
  position: { x: number; y: number },
  wire: { uri?: string; startNode?: string }
): Node => {
  const outputHandles: Array<{ id: string; label?: string }> = [];
  if (wire.startNode) {
    outputHandles.push({ id: "start", label: "" });
  }

  return {
    id,
    type: "wiringNode",
    position,
    data: {
      colorKey: "mcp",
      triggerType: "mcp-resource",
      label: wire.uri || "MCP Resource",
      wireId: wire.uri ? `resource:${wire.uri}` : undefined,
      outputHandles,
      nodeType: "wiring",
    },
  };
};

export const getScheduleWiringNodeConfig = (
  id: string,
  position: { x: number; y: number },
  wire: { cron?: string; interval?: string; startNode?: string }
): Node => {
  const outputHandles: Array<{ id: string; label?: string }> = [];
  if (wire.startNode) {
    outputHandles.push({ id: "start", label: "" });
  }

  const label = wire.cron || wire.interval || "Schedule";

  return {
    id,
    type: "wiringNode",
    position,
    data: {
      colorKey: "schedule",
      triggerType: "schedule",
      label,
      wireId: wire.cron || wire.interval,
      outputHandles,
      nodeType: "wiring",
    },
  };
};

export const getNamedWiringNodeConfig = (
  id: string,
  position: { x: number; y: number },
  wire: { name?: string; startNode?: string }
): Node => {
  const outputHandles: Array<{ id: string; label?: string }> = [];
  if (wire.startNode) {
    outputHandles.push({ id: "start", label: "" });
  }

  return {
    id,
    type: "wiringNode",
    position,
    data: {
      colorKey: "trigger",
      triggerType: "trigger",
      label: wire.name || "Trigger",
      wireId: wire.name,
      outputHandles,
      nodeType: "wiring",
    },
  };
};

