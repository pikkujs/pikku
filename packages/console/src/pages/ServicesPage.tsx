import React, { useMemo } from 'react'
import { Text } from '@pikku/mantine/core'
import { Server } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { TableListPage } from '../components/layout/TableListPage'
import { PikkuBadge } from '../components/ui/PikkuBadge'

interface ServiceItem {
  name: string
  funcCount: number
  functions: string[]
}

export const ServicesPage: React.FC = () => {
  const { meta, loading } = usePikkuMeta()
  useLocale()

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'NAME',
        render: (item: ServiceItem) => <Text fw={500}>{asI18n(item.name)}</Text>,
      },
      {
        key: 'functions',
        header: 'FUNCTIONS',
        align: 'right' as const,
        render: (item: ServiceItem) => (
          <PikkuBadge type="dynamic" badge="functions" value={item.funcCount} />
        ),
      },
    ],
    []
  )

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
        header={<ListPageHeader title={m.services_title()} description={m.services_description()} />}
        hidePanel
      >
        <TableListPage
          title="Services"
          icon={Server}
          docsHref="https://pikku.dev/docs/core-features/services"
          data={services}
          columns={columns}
          getKey={(item) => item.name}
          onRowClick={() => {}}
          searchPlaceholder={m.services_search_placeholder()}
          searchFilter={(item, q) =>
            item.name.toLowerCase().includes(q) ||
            item.functions.some((f) => f.toLowerCase().includes(q))
          }
          emptyMessage={m.services_empty_message()}
          loading={loading}
        />
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
