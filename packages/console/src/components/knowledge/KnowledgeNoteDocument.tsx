import React, { useId, useMemo, useState } from 'react'
import {
  Badge,
  Box,
  Collapse,
  Divider,
  Group,
  Stack,
  Text,
  UnstyledButton,
} from '@pikku/mantine/core'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import type { Components } from 'react-markdown'
import type { KnowledgeFinding, KnowledgeNote } from '../../lib/knowledge'
import {
  bodyWithoutTitle,
  parseResourceUri,
  readableBody,
  resolveNoteLink,
} from '../../lib/knowledge'
import { Markdown, asMarkdownContent } from '../ui/Markdown'
import { MetaRow } from '../ui/MetaRow'
import { KnowledgeNoteLinks } from './KnowledgeNoteLinks'
import { KnowledgeResourceLink } from './KnowledgeResourceLink'
import { KnowledgeSeverityIcon } from './KnowledgeSeverityIcon'
import { KnowledgeStatusBadge } from './KnowledgeStatusBadge'
import { KnowledgeTypeIcon } from './KnowledgeTypeIcon'
import classes from '../ui/console.module.css'

type KnowledgeNoteDocumentProps = {
  note: KnowledgeNote
  findings: KnowledgeFinding[]
  titleFor: (path: string) => string | undefined
  onOpenNote: (path: string) => void
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

  // Memoized on what it actually closes over. A renderer rebuilt per render is a
  // new component type per render, and react-markdown would remount the entire
  // body — losing the scroll position — every time anything on the page changes.
  const linkRenderer = useMemo<Components>(
    () => ({
      a: ({ href, children }) => {
        // Checked before anything else: a resource URI has a scheme, so every
        // other branch here would read `func:createEntry` as an external link
        // and hand it to the browser, which has nowhere to take it.
        if (href && parseResourceUri(href)) {
          return (
            <KnowledgeResourceLink uri={href}>
              {asMarkdownContent(children)}
            </KnowledgeResourceLink>
          )
        }
        const target = href ? resolveNoteLink(note.path, href) : null
        // Not a note: an http(s) link, an anchor, a source file. The one kind of
        // link the browser can follow on its own.
        if (target === null) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          )
        }
        // A note that names a note nobody has written yet. Legal in OKF, and not
        // a link: the href is a repo-relative path this console has nothing to
        // serve for, and offering it as one leads somewhere that 404s.
        if (titleFor(target) === undefined) {
          return (
            <Text
              component="span"
              c="dimmed"
              style={{ textDecoration: 'underline dotted' }}
              title={asI18n(target)}
            >
              {asMarkdownContent(children)}
            </Text>
          )
        }
        // A link between notes is a move within this page, not a navigation: the
        // note it names is already loaded.
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
    }),
    [note.path, titleFor, onOpenNote]
  )

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
                        <KnowledgeResourceLink key={uri} uri={uri} />
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

        <Markdown components={linkRenderer}>
          {bodyWithoutTitle(readableBody(note.body), note.title)}
        </Markdown>
      </Stack>
    </Box>
  )
}
