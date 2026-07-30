import React, { useId, useState } from 'react'
import {
  Badge,
  Box,
  Code,
  Collapse,
  Divider,
  Group,
  Stack,
  Text,
  Typography,
  UnstyledButton,
} from '@pikku/mantine/core'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { asI18n, type I18nNode } from '@pikku/react'
import { m } from '@/i18n/messages'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { KnowledgeFinding, KnowledgeNote } from '../../lib/knowledge'
import {
  bodyWithoutTitle,
  readableBody,
  resolveNoteLink,
} from '../../lib/knowledge'
import { MetaRow } from '../ui/MetaRow'
import { KnowledgeNoteLinks } from './KnowledgeNoteLinks'
import { KnowledgeSeverityIcon } from './KnowledgeSeverityIcon'
import { KnowledgeStatusBadge } from './KnowledgeStatusBadge'
import { KnowledgeTypeIcon } from './KnowledgeIcon'
import classes from '../ui/console.module.css'

type KnowledgeNoteDocumentProps = {
  note: KnowledgeNote
  findings: KnowledgeFinding[]
  titleFor: (path: string) => string | undefined
  onOpenNote: (path: string) => void
}

/**
 * Rendered markdown is the note's own words — untranslated by definition, since
 * a note is a file in the repo — so it is outside the i18n gate the same way
 * `asI18n` puts a dynamic string outside it. Nodes rather than a string, which is
 * what react-markdown hands a component.
 */
const asContent = (children: React.ReactNode): I18nNode => children as I18nNode

/**
 * A markdown heading at the console's document scale.
 *
 * Mantine's `Typography` hands every nested `h1..h6` the theme's heading font and
 * sizes — 40px JetBrains Mono for an `h1` — which is right for the title of a page
 * somebody designed and absurd for the third `###` in a decision note. Scoped to
 * this document rather than fixed in the theme: every other heading in the console
 * is one a component chose, and markdown is the only place the level comes from
 * the text itself.
 */
const markdownHeading = (
  component: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6',
  size: 'lg' | 'md' | 'sm',
  fw: number
): React.FC<{ children?: React.ReactNode }> => {
  const Heading: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
    <Text component={component} ff="text" size={size} fw={fw} mt="lg" mb={4}>
      {asContent(children)}
    </Text>
  )
  Heading.displayName = `MarkdownHeading(${component})`
  return Heading
}

/**
 * Built once: a components map rebuilt per render remounts the whole document on
 * every keystroke elsewhere on the page.
 */
const MARKDOWN_HEADINGS = {
  h1: markdownHeading('h1', 'lg', 700),
  h2: markdownHeading('h2', 'md', 600),
  h3: markdownHeading('h3', 'sm', 600),
  h4: markdownHeading('h4', 'sm', 600),
  h5: markdownHeading('h5', 'sm', 600),
  h6: markdownHeading('h6', 'sm', 600),
}

/**
 * One note, read as the document it is: what it is about in a line, its body as
 * the markdown it was written in, and the rest of its frontmatter behind a
 * disclosure.
 *
 * The details are folded away because they are reference, not reading: a note has
 * more frontmatter than prose in the small cases, and a header that fills the
 * screen before the first sentence buries the thing the note was written to say.
 * The disclosure stays open once opened, so a reader comparing edges across notes
 * opens it once.
 *
 * Read-only by design. A note is edited where it lives — in the repo, by whoever
 * or whatever learned the thing it records — and a console that could rewrite it
 * would be a second source of truth for a file that is already committed.
 */
export const KnowledgeNoteDocument: React.FC<KnowledgeNoteDocumentProps> = ({
  note,
  findings,
  titleFor,
  onOpenNote,
}) => {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const detailsId = useId()

  const hasDetails =
    note.entities.length > 0 ||
    note.resource.length > 0 ||
    note.outbound.length > 0 ||
    note.inbound.length > 0 ||
    note.dangling.length > 0

  return (
    <Box
      data-testid={`knowledge-document-${note.path}`}
      style={{ maxWidth: 860, padding: '28px 32px 64px' }}
    >
      <Stack gap="md">
        <Stack gap={6}>
          <Group gap={8} wrap="nowrap" align="center">
            <KnowledgeTypeIcon type={note.type} size={16} />
            <Text fw={700} size="xl" style={{ lineHeight: 1.25 }}>
              {asI18n(note.title)}
            </Text>
          </Group>
          {note.description && (
            <Text size="sm" c="dimmed" style={{ maxWidth: '68ch' }}>
              {asI18n(note.description)}
            </Text>
          )}
          {/*
            The path is identity in OKF, so it stays on the page — but beside the
            badges rather than on a line of its own, where it read as the subtitle
            of a note that already has one.
          */}
          <Group gap={6} align="center">
            {note.type && (
              <Badge size="xs" variant="light" radius="sm" tt="none">
                {asI18n(note.type)}
              </Badge>
            )}
            {note.status && <KnowledgeStatusBadge status={note.status} />}
            {note.tags.map((tag) => (
              <Badge
                key={tag}
                size="xs"
                variant="outline"
                radius="sm"
                tt="none"
                color="gray"
              >
                {asI18n(tag)}
              </Badge>
            ))}
            <Text size="xs" c="dimmed" ff="monospace">
              {asI18n(note.path)}
            </Text>
          </Group>
        </Stack>

        {findings.length > 0 && (
          <Stack gap={6} data-testid="knowledge-note-findings">
            {findings.map((finding) => (
              <Group key={finding.id} gap={8} wrap="nowrap" align="flex-start">
                <Box pt={2}>
                  <KnowledgeSeverityIcon severity={finding.severity} />
                </Box>
                <Stack gap={2}>
                  <Text size="sm">{asI18n(finding.message)}</Text>
                  <Text size="xs" c="dimmed">
                    {asI18n(finding.fixHint)}
                  </Text>
                </Stack>
              </Group>
            ))}
          </Stack>
        )}

        {hasDetails && (
          <Box>
            <UnstyledButton
              data-testid="knowledge-note-details-toggle"
              onClick={() => setDetailsOpen((open) => !open)}
              aria-expanded={detailsOpen}
              aria-controls={detailsId}
              className={classes.knowledgeRow}
              style={{ marginLeft: -10 }}
            >
              {detailsOpen ? (
                <ChevronDown size={12} color="var(--app-meta-label)" />
              ) : (
                <ChevronRight size={12} color="var(--app-meta-label)" />
              )}
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                {m.knowledge_details()}
              </Text>
            </UnstyledButton>

            {/*
              Unmounted while closed, not hidden: the links here carry the same
              titles as the links in the prose, and two anchors with one name is
              an ambiguity for a screen reader and for anything driving the page.
            */}
            <Collapse expanded={detailsOpen} keepMounted={false}>
              <Box id={detailsId} data-testid="knowledge-note-details">
                {note.entities.length > 0 && (
                  <MetaRow label={m.knowledge_entities()} labelWidth={110}>
                    <Group gap={10} wrap="wrap">
                      {note.entities.map((entity) => (
                        <Text size="sm" key={entity}>
                          {asI18n(entity)}
                        </Text>
                      ))}
                    </Group>
                  </MetaRow>
                )}

                {note.resource.length > 0 && (
                  <MetaRow label={m.knowledge_resources()} labelWidth={110}>
                    <Group gap={6} wrap="wrap">
                      {note.resource.map((uri) => (
                        <Code key={uri}>{uri}</Code>
                      ))}
                    </Group>
                  </MetaRow>
                )}

                <KnowledgeNoteLinks
                  label={m.knowledge_links_out()}
                  paths={note.outbound}
                  titleFor={titleFor}
                  onOpen={onOpenNote}
                />
                <KnowledgeNoteLinks
                  label={m.knowledge_links_in()}
                  paths={note.inbound}
                  titleFor={titleFor}
                  onOpen={onOpenNote}
                />
                <KnowledgeNoteLinks
                  label={m.knowledge_links_dangling()}
                  paths={note.dangling}
                />
              </Box>
            </Collapse>
          </Box>
        )}

        <Divider />

        <Typography className={classes.knowledgeBody}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              ...MARKDOWN_HEADINGS,
              a: ({ href, children }) => {
                const target = href ? resolveNoteLink(note.path, href) : null
                // Not a note: an http(s) link, an anchor, a source file. The one
                // kind of link the browser can follow on its own.
                if (target === null) {
                  return (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {children}
                    </a>
                  )
                }
                // A note that names a note nobody has written yet. Legal in OKF,
                // and not a link: the href is a repo-relative path this console
                // has nothing to serve for, and offering it as one leads
                // somewhere that 404s.
                if (titleFor(target) === undefined) {
                  return (
                    <Text
                      component="span"
                      c="dimmed"
                      style={{ textDecoration: 'underline dotted' }}
                      title={asI18n(target)}
                    >
                      {asContent(children)}
                    </Text>
                  )
                }
                // A link between notes is a move within this page, not a
                // navigation: the note it names is already loaded.
                return (
                  <a
                    href={href}
                    onClick={(event) => {
                      event.preventDefault()
                      onOpenNote(target)
                    }}
                  >
                    {children}
                  </a>
                )
              },
            }}
          >
            {bodyWithoutTitle(readableBody(note.body), note.title)}
          </ReactMarkdown>
        </Typography>
      </Stack>
    </Box>
  )
}
