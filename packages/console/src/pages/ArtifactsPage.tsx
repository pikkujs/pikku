import React, { useState } from 'react'
import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  Code,
  CopyButton,
  Divider,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import {
  Check,
  ChevronRight,
  Copy,
  FileCode2,
  FileText,
  Globe,
  LayoutTemplate,
  Search,
} from 'lucide-react'
import { useSearchParams } from '../router'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { CardsPage } from '../components/ui/CardsPage'
import { SectionCard } from '../components/ui/SectionCard'
import { CardRow } from '../components/ui/CardRow'
import { StatusTile } from '../components/ui/StatusTile'
import { StatusBadge, type StatusTone } from '../components/ui/StatusBadge'

type Kind = 'design' | 'page' | 'document'
type Shared =
  | { state: 'local' }
  | { state: 'live'; url: string; at: string }
  | { state: 'stale'; url: string; at: string }

type Artifact = {
  file: string
  title: string
  kind: Kind
  updated: string
  options?: string[]
  shared: Shared
}

const ARTIFACTS: Artifact[] = [
  {
    file: 'artifacts/screens.tsx',
    title: 'Concept map screens',
    kind: 'design',
    updated: '12 minutes ago',
    options: ['Desktop map', 'Phone sky', 'Focus sheet', 'Progress'],
    shared: {
      state: 'stale',
      url: 'https://artifact.pikkufabric.com/k7Qm2xR9',
      at: 'yesterday at 18:04',
    },
  },
  {
    file: 'artifacts/concept-node.tsx',
    title: 'Concept node states',
    kind: 'design',
    updated: '2 hours ago',
    options: ['Locked', 'Ready', 'Lit', 'Mastered'],
    shared: { state: 'local' },
  },
  {
    file: 'artifacts/launch-page.html',
    title: 'Launch page draft',
    kind: 'page',
    updated: '3 days ago',
    shared: {
      state: 'live',
      url: 'https://artifact.pikkufabric.com/Pz41fWc8',
      at: '3 days ago',
    },
  },
  {
    file: 'artifacts/learning-paths.md',
    title: 'How learning paths unlock',
    kind: 'document',
    updated: 'last week',
    shared: { state: 'local' },
  },
]

const KIND: Record<
  Kind,
  { title: string; blurb: string; Icon: typeof FileText }
> = {
  design: {
    title: 'Designs',
    blurb: "Screens drawn with your app's own components and sample data.",
    Icon: LayoutTemplate,
  },
  page: {
    title: 'Pages',
    blurb: 'Standalone web pages.',
    Icon: FileCode2,
  },
  document: {
    title: 'Documents',
    blurb: 'Written notes, plans and reports.',
    Icon: FileText,
  },
}

const SHARED: Record<Shared['state'], { tone: StatusTone; label: string }> = {
  local: { tone: 'neutral', label: 'Only on this computer' },
  live: { tone: 'good', label: 'Shared' },
  stale: { tone: 'warn', label: 'Changed since you shared it' },
}

const ArtifactRow: React.FC<{ artifact: Artifact; onOpen: () => void }> = ({
  artifact,
  onOpen,
}) => {
  const { Icon } = KIND[artifact.kind]
  const shared = SHARED[artifact.shared.state]
  return (
    <CardRow
      onClick={onOpen}
      leading={
        <StatusTile tone="info">
          <Icon size={18} />
        </StatusTile>
      }
      title={asI18n(artifact.title)}
      badges={
        <StatusBadge tone={shared.tone} size="sm">
          {asI18n(shared.label)}
        </StatusBadge>
      }
      meta={asI18n(`${artifact.file} · changed ${artifact.updated}`)}
      trailing={<ChevronRight size={16} />}
    />
  )
}

const Overview: React.FC<{ onOpen: (file: string) => void }> = ({
  onOpen,
}) => {
  const [query, setQuery] = useState('')
  const shown = ARTIFACTS.filter((a) =>
    `${a.title} ${a.file}`.toLowerCase().includes(query.trim().toLowerCase())
  )
  return (
    <ResizablePanelLayout
      hidePanel
      surface="cards"
      header={
        <ListPageHeader
          title={asI18n('Artifacts')}
          filters={
            <TextInput
              placeholder={asI18n('Search artifacts')}
              leftSection={<Search size={14} />}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              size="xs"
              w={240}
              maw="100%"
            />
          }
        />
      }
    >
      <CardsPage>
        <SectionCard
          hero
          title={asI18n('Artifacts')}
          blurb={asI18n(
            `Designs, pages and documents kept in this project's artifacts folder. They stay on your computer until you share one.`
          )}
        >
          <Group gap={8} mt="md">
            <StatusBadge tone="neutral" size="sm">
              {asI18n(`${ARTIFACTS.length} artifacts`)}
            </StatusBadge>
            <StatusBadge tone="good" size="sm">
              {asI18n(
                `${ARTIFACTS.filter((a) => a.shared.state !== 'local').length} shared`
              )}
            </StatusBadge>
          </Group>
        </SectionCard>
        {(Object.keys(KIND) as Kind[]).map((kind) => {
          const rows = shown.filter((a) => a.kind === kind)
          if (!rows.length) return null
          return (
            <SectionCard
              key={kind}
              title={asI18n(KIND[kind].title)}
              blurb={asI18n(KIND[kind].blurb)}
            >
              <Stack gap="xs" mt="md">
                {rows.map((a) => (
                  <ArtifactRow
                    key={a.file}
                    artifact={a}
                    onOpen={() => onOpen(a.file)}
                  />
                ))}
              </Stack>
            </SectionCard>
          )
        })}
      </CardsPage>
    </ResizablePanelLayout>
  )
}

const LinkField: React.FC<{ url: string }> = ({ url }) => (
  <Group gap={6} wrap="nowrap">
    <TextInput value={url} readOnly size="xs" style={{ flex: 1 }} />
    <CopyButton value={url}>
      {({ copied, copy }) => (
        <ActionIcon
          variant="default"
          onClick={copy}
          aria-label={asI18n(copied ? 'Copied' : 'Copy link')}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </ActionIcon>
      )}
    </CopyButton>
  </Group>
)

const SharePanel: React.FC<{ artifact: Artifact }> = ({ artifact }) => {
  const { shared } = artifact
  return (
    <Box style={{ flex: 1, minHeight: 0, overflow: 'auto' }} p="md">
      <Stack gap="lg">
        <Stack gap="xs">
          <Group justify="space-between">
            <Text fw={600}>{asI18n('Sharing')}</Text>
            <StatusBadge tone={SHARED[shared.state].tone} size="sm">
              {asI18n(SHARED[shared.state].label)}
            </StatusBadge>
          </Group>
          {shared.state === 'local' ? (
            <>
              <Text size="sm" c="dimmed">
                {asI18n(
                  'Publishing puts a copy online at a link you can send to anyone. Changes you make afterwards stay here until you update the link.'
                )}
              </Text>
              <Button leftSection={<Globe size={14} />}>
                {asI18n('Publish')}
              </Button>
            </>
          ) : (
            <>
              <LinkField url={shared.url} />
              <Text size="xs" c="dimmed">
                {asI18n(`Anyone with the link can view it. Shared ${shared.at}.`)}
              </Text>
              {shared.state === 'stale' && (
                <Paper variant="inset" p="sm">
                  <Stack gap={6}>
                    <Text size="sm">
                      {asI18n(
                        'The link still shows the version you shared. Update it to show what you see here.'
                      )}
                    </Text>
                    <Button size="xs">{asI18n('Update the link')}</Button>
                  </Stack>
                </Paper>
              )}
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="default"
                  component="a"
                  href={shared.url}
                  target="_blank"
                >
                  {asI18n('Open link')}
                </Button>
                <Button size="xs" variant="subtle" color="red">
                  {asI18n('Stop sharing')}
                </Button>
              </Group>
            </>
          )}
        </Stack>
        <Divider />
        {artifact.options && (
          <>
            <Stack gap="xs">
              <Text fw={600}>{asI18n('On this artifact')}</Text>
              {artifact.options.map((o) => (
                <Anchor key={o} size="sm">
                  {asI18n(o)}
                </Anchor>
              ))}
            </Stack>
            <Divider />
          </>
        )}
        <Stack gap="xs">
          <Text fw={600}>{asI18n('File')}</Text>
          <Code>{artifact.file}</Code>
          <Text size="xs" c="dimmed">
            {asI18n(`Changed ${artifact.updated}`)}
          </Text>
        </Stack>
      </Stack>
    </Box>
  )
}

const VIEWPORT = { desktop: 1320, phone: 390 } as const

const Detail: React.FC<{ artifact: Artifact; onBack: () => void }> = ({
  artifact,
  onBack,
}) => {
  const [viewport, setViewport] = useState<keyof typeof VIEWPORT>('desktop')
  const framed = artifact.kind !== 'document'
  return (
    <ResizablePanelLayout
      hidePanel
      surface="cards"
      sidePanel={<SharePanel artifact={artifact} />}
      sidePanelWidth={320}
      sidePanelLabel={asI18n('Sharing and details')}
      header={
        <ListPageHeader
          title={asI18n('Artifacts')}
          item={asI18n(artifact.title)}
          onTitle={onBack}
          filters={
            framed ? (
              <SegmentedControl
                size="xs"
                value={viewport}
                onChange={(v) => setViewport(v as keyof typeof VIEWPORT)}
                data={[
                  { value: 'desktop', label: asI18n('Desktop') },
                  { value: 'phone', label: asI18n('Phone') },
                ]}
              />
            ) : undefined
          }
        />
      }
    >
      <Box
        p="md"
        style={{
          height: '100%',
          display: 'flex',
          justifyContent: 'center',
          overflow: 'auto',
        }}
      >
        <Paper
          withBorder
          style={{
            width: VIEWPORT[viewport],
            maxWidth: '100%',
            height: viewport === 'phone' ? 844 : '100%',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <iframe
            title={artifact.title}
            src={`/artifact-preview/${artifact.file.split('/').pop()}`}
            style={{ border: 0, width: '100%', height: '100%' }}
          />
        </Paper>
      </Box>
    </ResizablePanelLayout>
  )
}

export const ArtifactsPage: React.FC = () => {
  const [params, setParams] = useSearchParams()
  const file = params.get('file')
  const artifact = ARTIFACTS.find((a) => a.file === file)
  return (
    <ConsoleSurface>
      {artifact ? (
        <Detail artifact={artifact} onBack={() => setParams({})} />
      ) : (
        <Overview onOpen={(f) => setParams({ file: f })} />
      )}
    </ConsoleSurface>
  )
}

export const ArtifactPublicPage: React.FC = () => {
  const artifact = ARTIFACTS[0]!
  return (
    <Box
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--mantine-color-body)',
      }}
    >
      <Group
        justify="space-between"
        px="md"
        py={8}
        wrap="nowrap"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Group gap="sm" wrap="nowrap" miw={0}>
          <Text fw={600} truncate>
            {asI18n(artifact.title)}
          </Text>
          <Text size="xs" c="dimmed" visibleFrom="sm">
            {asI18n('Shared yesterday at 18:04')}
          </Text>
        </Group>
        <Group gap="sm" wrap="nowrap">
          <CopyButton value={window.location.href}>
            {({ copied, copy }) => (
              <Button
                size="xs"
                variant="default"
                onClick={copy}
                leftSection={copied ? <Check size={14} /> : <Copy size={14} />}
              >
                {asI18n(copied ? 'Copied' : 'Copy link')}
              </Button>
            )}
          </CopyButton>
          <Anchor size="xs" c="dimmed" href="https://pikku.dev" visibleFrom="sm">
            {asI18n('Made with pikku')}
          </Anchor>
        </Group>
      </Group>
      <iframe
        title={artifact.title}
        src="/artifact-preview/screens.html"
        style={{ border: 0, flex: 1, width: '100%' }}
      />
    </Box>
  )
}
