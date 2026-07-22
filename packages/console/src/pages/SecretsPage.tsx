import React, { useMemo, useState } from 'react'
import { Group, TextInput } from '@pikku/mantine/core'
import { Search } from 'lucide-react'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { ProjectSecrets } from '../components/project/ProjectSecrets'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

const SecretsPageContent: React.FC<{ emptyHero?: React.ReactNode }> = ({
  emptyHero,
}) => {
  useLocale()
  const { meta, loading } = usePikkuMeta()
  const [searchQuery, setSearchQuery] = useState('')

  const allSecrets = useMemo(() => {
    if (!meta.secretsMeta) return []
    return Object.entries(meta.secretsMeta).map(
      ([name, data]: [string, any]) => ({
        name,
        displayName: data.displayName,
        description: data.description,
        secretId: data.secretId,
        isOAuth2: !!data.oauth2,
        rawData: data,
      })
    )
  }, [meta.secretsMeta])

  const secrets = useMemo(() => {
    if (!searchQuery) return allSecrets
    const q = searchQuery.toLowerCase()
    return allSecrets.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.displayName?.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q) ||
        s.secretId?.toLowerCase().includes(q)
    )
  }, [allSecrets, searchQuery])

  return (
    <ResizablePanelLayout
      header={
        <ListPageHeader
          title={m.secrets_title()}
          description={m.secrets_description()}
          docsHref="https://pikku.dev/docs/core-features/secrets"
          filters={
            <Group gap="sm" wrap="nowrap">
              <TextInput
                placeholder={m.secrets_search_placeholder()}
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
      emptyPanelMessage={m.secrets_select_item()}
    >
      <ProjectSecrets
        secrets={secrets}
        loading={loading}
        emptyHero={emptyHero}
      />
    </ResizablePanelLayout>
  )
}

export const SecretsPage: React.FC<{ emptyHero?: React.ReactNode }> = ({
  emptyHero,
}) => {
  return (
    <PanelProvider>
      <SecretsPageContent emptyHero={emptyHero} />
    </PanelProvider>
  )
}
