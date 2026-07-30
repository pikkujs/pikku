import React from 'react'
import {
  BookOpen,
  Boxes,
  FileText,
  HelpCircle,
  Layers,
  Scale,
  type LucideIcon,
} from 'lucide-react'

/**
 * One glyph per `type:`, so a drawer of a dozen notes can be read by shape
 * instead of by reading every title. The profile's own vocabulary — a slice is a
 * buildable piece, an entity a thing the app is about, a decision a rule that
 * rules something out — and anything a project invents falls back to a page.
 */
const TYPE_ICONS: Record<string, LucideIcon> = {
  overview: BookOpen,
  slice: Layers,
  entity: Boxes,
  decision: Scale,
  question: HelpCircle,
  note: FileText,
}

export const KnowledgeTypeIcon: React.FC<{
  type?: string
  size?: number
}> = ({ type, size = 13 }) => {
  const Icon = (type && TYPE_ICONS[type]) || FileText
  return <Icon size={size} color="var(--mantine-color-dimmed)" />
}
