import React, { useMemo } from 'react'
import { Text } from '@mantine/core'
import { Server } from 'lucide-react'
import { usePikkuMeta } from '@/context/PikkuMetaContext'
import { PanelProvider } from '@/context/PanelContext'
import { ResizablePanelLayout } from '@/components/layout/ResizablePanelLayout'
import { DetailPageHeader } from '@/components/layout/DetailPageHeader'
import { TableListPage } from '@/components/layout/TableListPage'
import { PikkuBadge } from '@/components/ui/PikkuBadge'

interface ServiceItem {
  name: string
  funcCount: number
  functions: string[]
}

const COLUMNS = [
  {
    key: 'name',
    header: 'NAME',
    render: (item: ServiceItem) => <Text fw={500}>{item.name}</Text>,
  },
  {
    key: 'functions',
    header: 'FUNCTIONS',
    align: 'right' as const,
    render: (item: ServiceItem) => (
      <PikkuBadge type="dynamic" badge="functions" value={item.funcCount} />
    ),
  },
]

export const ServicesPage: React.FunctionComponent = () => {
  const { meta, loading } = usePikkuMeta()

  const services = useMemo((): ServiceItem[] => {
    const serviceMap = new Map<
      string,
      { funcCount: number; functions: string[] }
    >()
    meta.functions?.forEach((func: any) => {
      if (func.services?.services) {
        for (const svc of func.services.services) {
          const existing = serviceMap.get(svc) || {
            funcCount: 0,
            functions: [],
          }
          existing.funcCount++
          existing.functions.push(func.pikkuFuncId)
          serviceMap.set(svc, existing)
        }
      }
    })
    return Array.from(serviceMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.funcCount - a.funcCount)
  }, [meta.functions])

  return (
    <PanelProvider>
      <ResizablePanelLayout
        header={
          <DetailPageHeader
            icon={Server}
            category="Services"
            docsHref="https://pikkujs.com/docs/services"
          />
        }
        hidePanel
      >
        <TableListPage
          title="Services"
          icon={Server}
          docsHref="https://pikkujs.com/docs/services"
          data={services}
          columns={COLUMNS}
          getKey={(item) => item.name}
          onRowClick={() => {}}
          searchPlaceholder="Search services..."
          searchFilter={(item, q) =>
            item.name.toLowerCase().includes(q) ||
            item.functions.some((f) => f.toLowerCase().includes(q))
          }
          emptyMessage="No services found."
          loading={loading}
        />
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
