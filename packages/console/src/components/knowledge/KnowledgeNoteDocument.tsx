import React from 'react'
import {
  Badge,
  Box,
  Code,
  Divider,
  Group,
  Stack,
  Text,
  Typography,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { KnowledgeFinding, KnowledgeNote } from '../../lib/knowledge'
import { resolveNoteLink } from '../../lib/knowledge'
import { KnowledgeNoteLinks } from './KnowledgeNoteLinks'
import { KnowledgeSeverityIcon } from './KnowledgeSeverityIcon'
import { KnowledgeStatusBadge } from './KnowledgeStatusBadge'

type KnowledgeNoteDocumentProps = {
  note: KnowledgeNote
  findings: KnowledgeFinding[]
  titleFor: (path: string) => string | undefined
  onOpenNote: (path: string) => void
}

/**
 * One note, read as the document it is: its frontmatter as a header, its body as
 * the markdown it was written in, and its edges in both directions underneath.
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
}) => (
  <Box
    data-testid={`knowledge-document-${note.path}`}
    style={{ maxWidth: 860, padding: '28px 32px 64px' }}
  >
    <Stack gap="lg">
      <Stack gap={8}>
        <Text fw={700} size="xl" style={{ lineHeight: 1.25 }}>
          {asI18n(note.title)}
        </Text>
        <Text size="xs" c="dimmed" ff="monospace">
          {asI18n(note.path)}
        </Text>
        {note.description && (
          <Text size="sm" c="dimmed" style={{ maxWidth: '68ch' }}>
            {asI18n(note.description)}
          </Text>
        )}
        <Group gap={6}>
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
        </Group>
      </Stack>

      {note.entities.length > 0 && (
        <Group gap={8} wrap="wrap" align="baseline">
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {m.knowledge_entities()}
          </Text>
          {note.entities.map((entity) => (
            <Text size="sm" key={entity}>
              {asI18n(entity)}
            </Text>
          ))}
        </Group>
      )}

      {note.resource.length > 0 && (
        <Stack gap={4}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {m.knowledge_resources()}
          </Text>
          <Group gap={6} wrap="wrap">
            {note.resource.map((uri) => (
              <Code key={uri}>{uri}</Code>
            ))}
          </Group>
        </Stack>
      )}

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

      <Divider />

      <Typography>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // A link between notes is a move within this page, not a navigation:
            // the href is a repo-relative path the browser cannot resolve, and
            // the note it names is already loaded.
            a: ({ href, children }) => {
              const target = href ? resolveNoteLink(note.path, href) : null
              if (target && titleFor(target) !== undefined) {
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
              }
              return (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              )
            },
          }}
        >
          {note.body}
        </ReactMarkdown>
      </Typography>

      <Stack gap="md">
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
      </Stack>
    </Stack>
  </Box>
)
