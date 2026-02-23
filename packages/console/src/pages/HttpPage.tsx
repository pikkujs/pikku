import React, { useMemo } from "react";
import { Text } from "@mantine/core";
import { Globe } from "lucide-react";
import { usePikkuMeta } from "@/context/PikkuMetaContext";
import { PanelProvider } from "@/context/PanelContext";
import { usePanelContext } from "@/context/PanelContext";
import { ResizablePanelLayout } from "@/components/layout/ResizablePanelLayout";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { TableListPage } from "@/components/layout/TableListPage";
import { PikkuBadge } from "@/components/ui/PikkuBadge";

const HttpTable: React.FunctionComponent<{ routes: any[]; loading?: boolean }> = ({ routes, loading }) => {
  const { openHTTPWire } = usePanelContext();

  const columns = useMemo(() => [
    {
      key: "route",
      header: "ROUTE",
      render: (route: any) => (
        <>
          <Text fw={500} truncate>{route.route}</Text>
          <Text size="xs" c="dimmed" truncate>{route.pikkuFuncId}</Text>
        </>
      ),
    },
    {
      key: "method",
      header: "METHOD",
      align: "right" as const,
      render: (route: any) => {
        const method = route.method?.toUpperCase() || "GET";
        return <PikkuBadge type="httpMethod" value={method} />;
      },
    },
  ], []);

  return (
    <TableListPage
      title="HTTP Routes"
      icon={Globe}
      docsHref="https://pikkujs.com/docs/http"
      data={routes}
      columns={columns}
      getKey={(route) => `${route.method}::${route.route}`}
      onRowClick={(route) => openHTTPWire(`http::${route.method}::${route.route}`, route)}
      searchPlaceholder="Search HTTP routes..."
      searchFilter={(route, q) =>
        route.route?.toLowerCase().includes(q) ||
        route.pikkuFuncId?.toLowerCase().includes(q) ||
        route.method?.toLowerCase().includes(q)
      }
      emptyMessage="No HTTP routes found."
      loading={loading}
    />
  );
};

export const HttpPage: React.FunctionComponent = () => {
  const { meta, loading } = usePikkuMeta();

  const routes = useMemo(() => {
    if (!meta.httpMeta) return [];
    return [...meta.httpMeta].sort((a, b) => a.route.localeCompare(b.route));
  }, [meta.httpMeta]);

  return (
    <PanelProvider>
      <ResizablePanelLayout header={<DetailPageHeader icon={Globe} category="HTTP Routes" docsHref="https://pikkujs.com/docs/http" />} showTabs={false} hidePanel={!loading && routes.length === 0} emptyPanelMessage="Select a route to view its details">
        <HttpTable routes={routes} loading={loading} />
      </ResizablePanelLayout>
    </PanelProvider>
  );
};
