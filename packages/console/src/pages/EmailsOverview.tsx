import React, { useMemo, useState } from 'react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Group, TextInput } from '@pikku/mantine/core'
import { Mail, Search } from 'lucide-react'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { EntityCardList } from '../components/layout/EntityCardList'
import type { EntityCardItem } from '../components/layout/EntityCardList'

const EMAIL_DOCS_HREF = 'https://pikku.dev/docs'

export type EmailsOverviewProps = {
  templateNames: string[]
  templates: Record<string, any>
  onSelect: (templateName: string) => void
  headerRight?: React.ReactNode
}

export const EmailsOverview: React.FC<EmailsOverviewProps> = ({
  templateNames,
  templates,
  onSelect,
  headerRight,
}) => {
  useLocale()
  const [searchQuery, setSearchQuery] = useState('')

  const allItems = useMemo((): EntityCardItem[] =>
    templateNames.map((name): EntityCardItem => {
      const t = templates[name]
      const varCount = (t.variables ?? []).length
      const localeCount = Object.keys(t.locales ?? {}).length
      const metaTags: string[] = []
      if (varCount > 0) metaTags.push(`${varCount} ${varCount === 1 ? 'variable' : 'variables'}`)
      if (localeCount > 0) metaTags.push(`${localeCount} ${localeCount === 1 ? 'locale' : 'locales'}`)
      return { name, meta: metaTags }
    }),
    [templateNames, templates]
  )

  const items = useMemo(() => {
    const q = searchQuery.toLowerCase()
    if (!q) return allItems
    return allItems.filter((item) => item.name.toLowerCase().includes(q))
  }, [allItems, searchQuery])

  return (
    <ResizablePanelLayout
      hidePanel
      header={
        <ListPageHeader
          title={m.emails_title()}
          description={m.emails_description()}
          docsHref={EMAIL_DOCS_HREF}
          filters={
            <Group gap="sm" wrap="nowrap">
              <TextInput
                placeholder={m.emails_search_placeholder()}
                leftSection={<Search size={14} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                size="xs"
                style={{ width: 240 }}
              />
              {headerRight}
            </Group>
          }
        />
      }
    >
      <EntityCardList
        items={items}
        onOpen={onSelect}
        icon={Mail}
        emptyTitle={m.emails_empty_title()}
        docsHref={EMAIL_DOCS_HREF}
      />
    </ResizablePanelLayout>
  )
}
