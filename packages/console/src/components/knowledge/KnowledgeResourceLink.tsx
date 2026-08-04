import React from 'react'
import { Code } from '@pikku/mantine/core'
import {
  Braces,
  Clock,
  FunctionSquare,
  Globe,
  GitBranch,
  KeyRound,
  ListOrdered,
  Package,
  Radio,
  Table2,
  UserRound,
} from 'lucide-react'
import { asI18n } from '@pikku/react'
import { useLink } from '../../router'
import {
  parseResourceUri,
  resourceHref,
  type ResourcePrefix,
} from '../../lib/knowledge'
import classes from '../ui/console.module.css'

const RESOURCE_ICONS: Record<
  ResourcePrefix,
  React.ComponentType<{ size?: number }>
> = {
  func: FunctionSquare,
  workflow: GitBranch,
  schema: Braces,
  http: Globe,
  queue: ListOrdered,
  cron: Clock,
  channel: Radio,
  table: Table2,
  addon: Package,
  scope: KeyRound,
  persona: UserRound,
}

type KnowledgeResourceLinkProps = {
  /** The raw `<kind>:<id>` URI, as the note wrote it. */
  uri: string
  /**
   * What to show instead of the id — the link text, when the URI came from a
   * markdown link rather than from frontmatter.
   */
  children?: React.ReactNode
}

/**
 * A `resource:` URI as the thing it names: an icon for its kind and a link to
 * the screen that shows it.
 *
 * This is the edge from the knowledge base back into the app. A note says a
 * milestone is about `func:createEntry`; every prefix in the scheme is checked
 * against generated meta at build time, so the id on screen is one that really
 * exists — which makes it worth making clickable, and worth showing as a
 * different kind of thing from an ordinary word in the prose.
 *
 * Kinds with no screen (a generated `schema:`) render as plain code. Not every
 * true statement about the code has somewhere to go.
 */
export const KnowledgeResourceLink: React.FC<KnowledgeResourceLinkProps> = ({
  uri,
  children,
}) => {
  const Link = useLink()
  const parsed = parseResourceUri(uri)
  if (!parsed) return <Code>{asI18n(uri)}</Code>

  const Icon = RESOURCE_ICONS[parsed.prefix]
  const href = resourceHref(uri)
  // Standing on its own — a chip in the note's details — the URI is shown whole:
  // the kind is half of what it says, two kinds can share an id, and it is the
  // exact string somebody would grep for. Inline in a sentence the author has
  // already written the words that belong there.
  const label = children ?? asI18n(uri)

  const body = (
    <>
      <Icon size={11} />
      {label}
    </>
  )

  if (!href) {
    return (
      <span className={classes.resourceChip} data-kind={parsed.prefix}>
        {body}
      </span>
    )
  }

  return (
    <Link
      to={href}
      className={classes.resourceChip}
      data-kind={parsed.prefix}
      data-linked="true"
      // The prefix is the half of the URI the label drops, and a reader who has
      // not learned the icons still needs to know which `entry` this is.
      title={uri}
    >
      {body}
    </Link>
  )
}
