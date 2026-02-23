import React from "react";
import { NodeProps } from "reactflow";
import { BaseNode } from "./BaseNode";

interface DecisionNodeData {
  icon: React.ComponentType<{ size?: number }>;
  colorKey: string;
  title: string;
  description?: string;
  actions: string[];
}

export const DecisionNode: React.FunctionComponent<
  NodeProps<DecisionNodeData>
> = ({ data }) => {
  return <BaseNode data={data} hasInput={true} hasOutput={true} width={200} />;
};
