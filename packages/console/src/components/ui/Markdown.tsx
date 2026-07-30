import React from 'react'
import { Typography, type TypographyProps } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import classes from './console.module.css'

/**
 * Rendered markdown is somebody else's words — a note in the repo, a package's
 * README, an agent's reply — so it is untranslatable by definition and sits
 * outside the i18n gate the same way `asI18n` puts a dynamic string outside it.
 * Nodes rather than a string, which is what react-markdown hands a component.
 */
export const asMarkdownContent = (children: React.ReactNode): I18nNode =>
  children as I18nNode

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

/**
 * Markdown as the console renders it: sane heading sizes, fenced blocks in a real
 * code surface, links in the accent colour.
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
}) => (
  <Typography
    className={
      className ? `${classes.markdownBody} ${className}` : classes.markdownBody
    }
    {...typographyProps}
  >
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  </Typography>
)
