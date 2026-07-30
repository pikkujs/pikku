import React from 'react'
import {
  BookOpen,
  Boxes,
  FileText,
  HelpCircle,
  Layers,
  Lock,
  Palette,
  Scale,
  ScrollText,
  Sparkles,
  UserRound,
  Users,
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

/**
 * One glyph per section, matched on the last segment so `decisions/security`
 * gets the lock rather than the scales its parent wears. A section the profile
 * does not name — anything a project adds — takes the icon of the section it
 * sits in, and a bare folder at the root gets a page.
 */
const SECTION_ICONS: Record<string, LucideIcon> = {
  slices: Layers,
  entities: Boxes,
  decisions: Scale,
  security: Lock,
  design: Palette,
  questions: HelpCircle,
  wishlist: Sparkles,
  personas: Users,
  actors: UserRound,
  log: ScrollText,
}

export const KnowledgeTypeIcon: React.FC<{
  type?: string
  size?: number
}> = ({ type, size = 13 }) => {
  const Icon = (type && TYPE_ICONS[type]) || FileText
  return <Icon size={size} color="var(--mantine-color-dimmed)" />
}

export const KnowledgeSectionIcon: React.FC<{
  /** The full section path — `decisions/security`, not `security`. */
  section: string
  size?: number
}> = ({ section, size = 12 }) => {
  // The root of the bundle is the entry point, which is a book, not a folder.
  if (!section) return <BookOpen size={size} color="var(--app-meta-label)" />
  const segments = section.split('/')
  const Icon =
    segments
      .slice()
      .reverse()
      .map((segment) => SECTION_ICONS[segment])
      .find(Boolean) ?? FileText
  return <Icon size={size} color="var(--app-meta-label)" />
}
