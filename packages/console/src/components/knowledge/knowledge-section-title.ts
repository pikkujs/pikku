import { asI18n, type I18nString } from '@pikku/react'
import { m } from '@/i18n/messages'
import type { KnowledgeNote } from '../../lib/knowledge'

/**
 * What a section is called on screen: its own index's title when it wrote one,
 * otherwise the folder name. The root is the entry point, whatever it is called.
 */
export const knowledgeSectionTitle = (
  section: string,
  index: KnowledgeNote | undefined
): I18nString => {
  if (!section) return m.knowledge_section_start_title()
  if (index?.title) return asI18n(index.title)
  const label = section.split('/').pop() ?? section
  return asI18n(label.charAt(0).toUpperCase() + label.slice(1))
}
