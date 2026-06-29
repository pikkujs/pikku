import React, { useMemo } from 'react'
import { Text } from '@pikku/mantine/core'
import { Server } from 'lucide-react'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { TableListPage } from '../layout/TableListPage'
import { PikkuBadge } from '../ui/PikkuBadge'
import { asI18n } from '@pikku/react'
import { useI18n } from '@pikku/react/i18n'

interface ServiceItem {
  name: string
  funcCount: number
  functions: string[]
}

const COLUMNS = [
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
]

export const ServicesTab: React.FC<{ searchQuery: string }> = ({ searchQuery }) => {
  const { meta, loading } = usePikkuMeta()
  const { t } = useI18n()

  const allServices = useMemo((): ServiceItem[] => {
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

  const services = useMemo(() => {
    if (!searchQuery) return allServices
    const q = searchQuery.toLowerCase()
    return allServices.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.functions.some((f) => f.toLowerCase().includes(q))
    )
  }, [allServices, searchQuery])

  return (
    <TableListPage
      title="Services"
      icon={Server}
      docsHref="https://pikku.dev/docs/core-features/services"
      data={services}
      columns={COLUMNS}
      getKey={(item) => item.name}
      onRowClick={() => {}}
      emptyMessage={t('services.empty_message')}
      loading={loading}
    />
  )
}
