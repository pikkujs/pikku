import React, { isValidElement, useMemo } from 'react'
import { Typography, type TypographyProps } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import ReactMarkdown, {
  defaultUrlTransform,
  type Components,
} from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Info,
  Lightbulb,
  MessageSquareWarning,
  OctagonAlert,
  TriangleAlert,
} from 'lucide-react'
import { CodeHighlight } from '@mantine/code-highlight'
import { m } from '@/i18n/messages'
import {
  alertKindOf,
  remarkAlerts,
  type AlertKind,
} from '../../lib/remarkAlerts'
import { parseResourceUri } from '../../lib/knowledge'
import { KnowledgeResourceLink } from '../knowledge/KnowledgeResourceLink'
import { MermaidDiagram } from './MermaidDiagram'
import { ScrollRegion } from './ScrollRegion'
import classes from './console.module.css'

/**
 * Rendered markdown is somebody else's words — a note in the repo, a package's
 * README, an agent's reply — so it is untranslatable by definition and sits
 * outside the i18n gate the same way `asI18n` puts a dynamic string outside it.
 * Nodes rather than a string, which is what react-markdown hands a component.
 */
export const asMarkdownContent = (children: React.ReactNode): I18nNode =>
  children as I18nNode

const ALERT_ICONS: Record<AlertKind, React.ComponentType<{ size?: number }>> = {
  note: Info,
  tip: Lightbulb,
  important: MessageSquareWarning,
  warning: TriangleAlert,
  caution: OctagonAlert,
}

const ALERT_LABELS: Record<AlertKind, () => I18nNode> = {
  note: m.markdown_alert_note,
  tip: m.markdown_alert_tip,
  important: m.markdown_alert_important,
  warning: m.markdown_alert_warning,
  caution: m.markdown_alert_caution,
}

/** The language a fence declares — react-markdown puts it on the inner `code`. */
const fenceLanguage = (child: React.ReactNode): string | undefined => {
  if (!isValidElement<{ className?: string }>(child)) return undefined
  return /language-([\w-]+)/.exec(child.props.className ?? '')?.[1]
}

const fenceText = (child: React.ReactNode): string => {
  if (!isValidElement<{ children?: React.ReactNode }>(child)) return ''
  const { children } = child.props
  return (
    Array.isArray(children) ? children.join('') : String(children ?? '')
  ).trim()
}

/**
 * A heading's own anchor, from its words.
 *
 * A knowledge note is read to be pointed at — "the bit about the scope gate" —
 * and a document whose headings have no ids cannot be linked to below its title.
 */
const headingText = (children: React.ReactNode): string => {
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children)
  }
  if (Array.isArray(children)) return children.map(headingText).join('')
  if (isValidElement<{ children?: React.ReactNode }>(children)) {
    return headingText(children.props.children)
  }
  return ''
}

const slugOf = (children: React.ReactNode): string | undefined => {
  const slug = headingText(children)
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return slug || undefined
}

const heading = (level: 1 | 2 | 3 | 4): Components['h1'] =>
  function Heading({ children, node: _node, ...props }) {
    const Tag = `h${level}` as const
    return (
      <Tag id={slugOf(children)} {...props}>
        {children}
      </Tag>
    )
  }

/**
 * The renderers every document gets: the parts of markdown that are structure
 * rather than prose, and that a stock `<pre>`/`<blockquote>`/`<table>` draws as
 * a wall of text.
 */
const RICH_COMPONENTS: Components = {
  h1: heading(1),
  h2: heading(2),
  h3: heading(3),
  h4: heading(4),

  // A fence is a diagram or it is code, and code in a developer console is
  // something the reader means to take: highlighted, and copyable in one action.
  // Overridden at `pre` rather than at `code` because both replacements are
  // block elements, and rendering one from the `code` renderer would nest it
  // inside the `<pre>` it is meant to replace.
  pre: ({ children, node: _node, ...props }) => {
    const child = Array.isArray(children) ? children[0] : children
    const language = fenceLanguage(child)
    if (language === 'mermaid') {
      return <MermaidDiagram code={fenceText(child)} />
    }
    const code = fenceText(child)
    if (!code) return <pre {...props}>{children}</pre>
    return (
      <CodeHighlight
        code={code}
        language={language ?? 'text'}
        copyLabel={m.markdown_copy()}
        copiedLabel={m.markdown_copied()}
        className={classes.markdownCode}
      />
    )
  },

  // A `<kind>:<id>` target is a link into the app rather than out to the web,
  // and is drawn as the thing it names. First, because a resource URI has a
  // scheme and every other branch would read it as external.
  a: ({ href, children, node: _node, ...props }) => {
    if (href && parseResourceUri(href)) {
      return (
        <KnowledgeResourceLink uri={href}>
          {asMarkdownContent(children)}
        </KnowledgeResourceLink>
      )
    }
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  },

  blockquote: ({ children, className, node: _node, ...props }) => {
    const kind = alertKindOf(className)
    if (!kind) {
      return (
        <blockquote className={className} {...props}>
          {children}
        </blockquote>
      )
    }
    const Icon = ALERT_ICONS[kind]
    // Still a blockquote: that is what the author wrote and what it means, and
    // the styling is what makes it a callout.
    return (
      <blockquote
        className={`${classes.markdownAlert} ${className ?? ''}`}
        data-alert={kind}
        {...props}
      >
        <div className={classes.markdownAlertLabel}>
          <Icon size={14} />
          {ALERT_LABELS[kind]()}
        </div>
        {children}
      </blockquote>
    )
  },

  // A wide table scrolls inside its own box. Without this the document scrolls
  // sideways and every paragraph on the page moves with it. Focusable and named,
  // because a region only a pointer can scroll hides a column from everyone
  // else — and the shadow at its edge is what says a column is there at all.
  table: ({ children, node: _node, ...props }) => (
    <ScrollRegion
      className={classes.markdownTableScroll}
      label={m.markdown_table_label()}
    >
      <table {...props}>{children}</table>
    </ScrollRegion>
  ),
}

type MarkdownProps = {
  /** The markdown source. */
  children: string
  /**
   * Renderers for the one thing this component cannot know — where a link goes,
   * in a bundle only the caller can resolve. Memoize it, or react-markdown sees a
   * new component type every render and remounts the document under it.
   */
  components?: Components
} & Omit<TypographyProps, 'children'>

const REMARK_PLUGINS = [remarkGfm, remarkAlerts]

/**
 * react-markdown drops the href of any scheme it does not recognise, which is
 * the right default for `javascript:` and takes `func:createEntry` with it — the
 * link renders, points nowhere, and reloads the page when clicked.
 *
 * A resource URI is safe by construction: it is `<kind>:<id>` against a closed
 * set of kinds, it never becomes a URL, and the renderer turns it into an
 * in-app route rather than an href the browser follows.
 */
const urlTransform = (url: string) =>
  parseResourceUri(url) ? url : defaultUrlTransform(url)

/**
 * Markdown as the console renders it: sane heading sizes, fenced blocks in a real
 * code surface, links in the accent colour, GFM tables, `> [!NOTE]` callouts, and
 * ```mermaid fences drawn as diagrams.
 *
 * One component rather than a `<Typography><ReactMarkdown>` pair per call site —
 * there are three of them, and every one had the same wrong headings for as long
 * as each was written out separately.
 */
export const Markdown: React.FC<MarkdownProps> = ({
  children,
  components,
  className,
  ...typographyProps
}) => {
  // Merged into one stable object: a `components` prop rebuilt per render is a
  // new component type per render, and react-markdown remounts the document
  // under it — which is why the callers memoize theirs.
  const merged = useMemo(
    () => (components ? { ...RICH_COMPONENTS, ...components } : RICH_COMPONENTS),
    [components]
  )
  return (
    <Typography
      className={
        className ? `${classes.markdownBody} ${className}` : classes.markdownBody
      }
      {...typographyProps}
    >
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        components={merged}
        urlTransform={urlTransform}
      >
        {children}
      </ReactMarkdown>
    </Typography>
  )
}
