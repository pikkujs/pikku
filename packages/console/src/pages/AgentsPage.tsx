import React, { useMemo, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Text, Center, Loader } from "@mantine/core";
import { Bot } from "lucide-react";
import { usePikkuMeta } from "@/context/PikkuMetaContext";
import { PanelProvider, usePanelContext } from "@/context/PanelContext";
import { ResizablePanelLayout } from "@/components/layout/ResizablePanelLayout";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { TableListPage } from "@/components/layout/TableListPage";
import { PikkuBadge } from "@/components/ui/PikkuBadge";

interface AgentItem {
  name: string;
  model?: string;
  toolCount: number;
  agentCount: number;
  data: any;
}

const AgentsList: React.FunctionComponent = () => {
  const navigate = useNavigate();
  const { meta, loading } = usePikkuMeta();

  const items = useMemo((): AgentItem[] => {
    if (!meta.agentsMeta) return [];
    return Object.entries(meta.agentsMeta).map(([name, data]: [string, any]) => ({
      name,
      model: data.model,
      toolCount: (data.tools || []).length,
      agentCount: (data.agents || []).length,
      data,
    }));
  }, [meta.agentsMeta]);

  const columns = useMemo(() => [
    {
      key: "name",
      header: "NAME",
      render: (item: AgentItem) => (
        <>
          <Text fw={500} truncate>{item.name}</Text>
          {item.data?.summary && <Text size="xs" c="dimmed" truncate>{item.data.summary}</Text>}
        </>
      ),
    },
    {
      key: "model",
      header: "MODEL",
      render: (item: AgentItem) =>
        item.model ? (
          <PikkuBadge type="dynamic" badge="model" value={item.model} />
        ) : null,
    },
    {
      key: "tools",
      header: "TOOLS",
      render: (item: AgentItem) =>
        item.toolCount > 0 ? (
          <PikkuBadge type="dynamic" badge="tools" value={item.toolCount} />
        ) : null,
    },
    {
      key: "agents",
      header: "AGENTS",
      align: "right" as const,
      render: (item: AgentItem) =>
        item.agentCount > 0 ? (
          <PikkuBadge type="dynamic" badge="agents" value={item.agentCount} />
        ) : null,
    },
  ], []);

  return (
    <TableListPage
      title="Agents"
      icon={Bot}
      docsHref="https://pikkujs.com/docs/agents"
      data={items}
      columns={columns}
      getKey={(item) => item.name}
      onRowClick={(item) => navigate(`/agents/playground?id=${encodeURIComponent(item.name)}`)}
      searchPlaceholder="Search agents..."
      searchFilter={(item, q) =>
        item.name.toLowerCase().includes(q) ||
        item.model?.toLowerCase().includes(q) ||
        item.data?.summary?.toLowerCase().includes(q) ||
        false
      }
      emptyMessage="No agents found."
      loading={loading}
    />
  );
};

const AgentDetailView: React.FunctionComponent<{ agentId: string }> = ({ agentId }) => {
  const { meta } = usePikkuMeta();
  const { openAgent } = usePanelContext();

  useEffect(() => {
    const agentData = meta.agentsMeta?.[agentId];
    if (agentData) {
      openAgent(agentId, agentData);
    }
  }, [agentId, meta.agentsMeta, openAgent]);

  return <div />;
};

export const AgentsPage: React.FunctionComponent = () => {
  const [searchParams] = useSearchParams();
  const agentId = searchParams.get("id");

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={<DetailPageHeader icon={Bot} category="Agents" docsHref="https://pikkujs.com/docs/agents" />}
        hidePanel={!agentId}
      >
        {agentId ? <AgentDetailView agentId={agentId} /> : <AgentsList />}
      </ResizablePanelLayout>
    </PanelProvider>
  );
};
