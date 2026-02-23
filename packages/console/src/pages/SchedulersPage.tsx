import React, { useMemo } from "react";
import { Text } from "@mantine/core";
import { Clock } from "lucide-react";
import { usePikkuMeta } from "@/context/PikkuMetaContext";
import { PanelProvider, usePanelContext } from "@/context/PanelContext";
import { ResizablePanelLayout } from "@/components/layout/ResizablePanelLayout";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { TableListPage } from "@/components/layout/TableListPage";
import { PikkuBadge } from "@/components/ui/PikkuBadge";

interface SchedulerItem {
  name: string;
  handler?: string;
  schedule?: string;
  data: any;
}

const SchedulersTable: React.FunctionComponent<{ items: SchedulerItem[]; loading?: boolean }> = ({ items, loading }) => {
  const { openScheduler } = usePanelContext();

  const columns = useMemo(() => [
    {
      key: "name",
      header: "NAME",
      render: (item: SchedulerItem) => (
        <>
          <Text fw={500} truncate>{item.name}</Text>
          {item.handler && <Text size="xs" c="dimmed" truncate>{item.handler}</Text>}
        </>
      ),
    },
    {
      key: "schedule",
      header: "SCHEDULE",
      align: "right" as const,
      render: (item: SchedulerItem) =>
        item.schedule ? (
          <PikkuBadge type="dynamic" badge="schedule" value={item.schedule} />
        ) : null,
    },
  ], []);

  return (
    <TableListPage
      title="Schedulers"
      icon={Clock}
      docsHref="https://pikkujs.com/docs/schedulers"
      data={items}
      columns={columns}
      getKey={(item) => item.name}
      onRowClick={(item) => openScheduler(item.name, item.data)}
      searchPlaceholder="Search scheduled tasks..."
      searchFilter={(item, q) =>
        item.name.toLowerCase().includes(q) ||
        item.handler?.toLowerCase().includes(q) ||
        item.schedule?.toLowerCase().includes(q) ||
        false
      }
      emptyMessage="No scheduled tasks found."
      loading={loading}
    />
  );
};

export const SchedulersPage: React.FunctionComponent = () => {
  const { meta, loading } = usePikkuMeta();

  const items = useMemo((): SchedulerItem[] => {
    if (!meta.schedulerMeta) return [];
    return Object.entries(meta.schedulerMeta).map(([name, data]: [string, any]) => ({
      name,
      handler: data.pikkuFuncId,
      schedule: data.schedule,
      data,
    }));
  }, [meta.schedulerMeta]);

  return (
    <PanelProvider>
      <ResizablePanelLayout header={<DetailPageHeader icon={Clock} category="Schedulers" docsHref="https://pikkujs.com/docs/schedulers" />} showTabs={false} hidePanel={!loading && items.length === 0} emptyPanelMessage="Select a scheduler to view its details">
        <SchedulersTable items={items} loading={loading} />
      </ResizablePanelLayout>
    </PanelProvider>
  );
};
