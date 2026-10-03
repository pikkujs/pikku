import React, { useMemo } from 'react'
import { Mail } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { EntityCardList } from '../layout/EntityCardList'
import type { EntityCardItem } from '../layout/EntityCardList'

const EMAIL_DOCS_HREF = 'https://pikku.dev/docs'

export interface EmailTemplateListPanelProps {
  onSelect: (templateName: string) => void
  /** Filters by template name. Omit for the full list. */
  searchQuery?: string
  /** Template names to show. Defaults to every template in the project meta. */
  templateNames?: string[]
  /** Template meta keyed by name. Defaults to the project meta. */
  templates?: Record<string, any>
}

/**
 * Every email template in the project as selectable cards.
 *
 * Falls back to the project meta when a host doesn't hand it a list, so it can
 * be mounted on its own as well as from inside the emails page.
 */
export const EmailTemplateListPanel: React.FC<EmailTemplateListPanelProps> = ({
  onSelect,
  searchQuery = '',
  templateNames,
  templates,
}) => {
  useLocale()
  const { meta } = usePikkuMeta()
  const metaTemplates = meta.emailsMeta?.templates || {}
  const resolvedTemplates = templates ?? metaTemplates
  const metaTemplateNames = useMemo(
    () => Object.keys(metaTemplates).sort((a, b) => a.localeCompare(b)),
    [metaTemplates]
  )
  const resolvedNames = templateNames ?? metaTemplateNames

  const allItems = useMemo(
    (): EntityCardItem[] =>
      resolvedNames.map((name): EntityCardItem => {
        const t = resolvedTemplates[name]
        const varCount = (t.variables ?? []).length
        const localeCount = Object.keys(t.locales ?? {}).length
        const metaTags: string[] = []
        if (varCount > 0)
          metaTags.push(
            `${varCount} ${varCount === 1 ? 'variable' : 'variables'}`
          )
        if (localeCount > 0)
          metaTags.push(
            `${localeCount} ${localeCount === 1 ? 'locale' : 'locales'}`
          )
        return { name, meta: metaTags }
      }),
    [resolvedNames, resolvedTemplates]
  )

  const items = useMemo(() => {
    const q = searchQuery.toLowerCase()
    if (!q) return allItems
    return allItems.filter((item) => item.name.toLowerCase().includes(q))
  }, [allItems, searchQuery])

  return (
    <EntityCardList
      items={items}
      onOpen={onSelect}
      icon={Mail}
      emptyTitle={m.emails_empty_title()}
      docsHref={EMAIL_DOCS_HREF}
    />
  )
}
