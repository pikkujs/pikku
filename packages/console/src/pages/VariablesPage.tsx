import React, { useMemo, useState } from 'react'
import { Group, TextInput } from '@pikku/mantine/core'
import { Search } from 'lucide-react'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { ProjectVariables } from '../components/project/ProjectVariables'
import { useI18n } from '@pikku/react/i18n'

const VariablesPageContent: React.FC<{ emptyHero?: React.ReactNode }> = ({ emptyHero }) => {
  const { t } = useI18n()
  const { meta, loading } = usePikkuMeta()
  const [searchQuery, setSearchQuery] = useState('')

  const allVariables = useMemo(() => {
    if (!meta.variablesMeta) return []
    return Object.entries(meta.variablesMeta).map(
      ([name, data]: [string, any]) => ({
        name,
        displayName: data.displayName,
        description: data.description,
        variableId: data.variableId,
        rawData: data,
      })
    )
  }, [meta.variablesMeta])

  const variables = useMemo(() => {
    if (!searchQuery) return allVariables
    const q = searchQuery.toLowerCase()
    return allVariables.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.displayName?.toLowerCase().includes(q) ||
        v.description?.toLowerCase().includes(q) ||
        v.variableId?.toLowerCase().includes(q)
    )
  }, [allVariables, searchQuery])

  return (
    <ResizablePanelLayout
      header={
        <ListPageHeader
          title={t('variables.title')}
          description={t('variables.description')}
          docsHref="https://pikku.dev/docs/core-features/variables"
          filters={
            <Group gap="sm" wrap="nowrap">
              <TextInput
                placeholder={t('variables.search_placeholder')}
                leftSection={<Search size={14} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                size="xs"
                style={{ width: 240 }}
              />
            </Group>
          }
        />
      }
      emptyPanelMessage={t('variables.select_item')}
    >
      <ProjectVariables variables={variables} loading={loading} emptyHero={emptyHero} />
    </ResizablePanelLayout>
  )
}

export const VariablesPage: React.FC<{ emptyHero?: React.ReactNode }> = ({ emptyHero }) => {
  return (
    <PanelProvider>
      <VariablesPageContent emptyHero={emptyHero} />
    </PanelProvider>
  )
}
