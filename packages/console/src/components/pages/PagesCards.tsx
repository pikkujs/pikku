import React, { useState } from 'react'
import {
  ActionIcon,
  Anchor,
  AspectRatio,
  Box,
  Button,
  Group,
  Image,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@pikku/mantine/core'
import { asI18n, type I18nNode } from '@pikku/react'
import {
  Camera,
  ChevronRight,
  ExternalLink,
  ImageOff,
  Monitor,
  MonitorCheck,
  MonitorDot,
  MonitorPlay,
  MonitorX,
  X,
} from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import {
  fillPagePath,
  pageKey,
  pageNeedsExample,
  type AppPage,
  type PageShot,
  type PageShots,
} from '../../hooks/usePages'
import { SectionCard } from '../ui/SectionCard'
import { CardRow } from '../ui/CardRow'
import { StatusTile } from '../ui/StatusTile'
import { StatusBadge, type StatusTone } from '../ui/StatusBadge'
import { ForDevelopers } from '../ui/ForDevelopers'
import { DevCode, DevField, DevFields, DevNote } from '../ui/DevDetail'

type PageState = 'ok' | 'problems' | 'failed' | 'none' | 'example'

const STATE: Record<
  PageState,
  { tone: StatusTone; label: () => I18nNode; Icon: typeof Monitor }
> = {
  ok: { tone: 'good', label: m.pages_status_ok, Icon: MonitorCheck },
  problems: { tone: 'warn', label: m.pages_status_problems, Icon: MonitorDot },
  failed: { tone: 'bad', label: m.pages_status_failed, Icon: MonitorX },
  none: { tone: 'neutral', label: m.pages_status_none, Icon: Monitor },
  example: { tone: 'neutral', label: m.pages_status_example, Icon: MonitorPlay },
}

const stateOf = (page: AppPage, shot: PageShot | undefined): PageState => {
  if (!shot) return pageNeedsExample(page) ? 'example' : 'none'
  if (!shot.png || shot.error || (shot.httpStatus ?? 0) >= 400) return 'failed'
  return shot.problems.length ? 'problems' : 'ok'
}

const humanize = (value: string) => {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_.]+/g, ' ')
    .trim()
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

const isParam = (segment: string) =>
  segment.startsWith('$') || /^\{-\$.+\}$/.test(segment)

const isLanguage = (segment: string) =>
  /^(\{-)?\$(lang|locale)\}?$/.test(segment)

export const pageName = (page: AppPage): I18nNode => {
  const segments = page.path
    .split('/')
    .filter((segment) => segment && !isLanguage(segment))
  if (!segments.length) return m.pages_name_home()
  if (segments.length === 1 && segments[0] === '$') return m.pages_name_any()
  return asI18n(
    segments
      .map((segment) =>
        segment === '$'
          ? String(m.pages_name_any())
          : isParam(segment)
            ? String(m.pages_name_details())
            : humanize(segment)
      )
      .join(' › ')
  )
}

const appName = (app: string) => app.split('/').pop() || app

const examplesFor = (page: AppPage) =>
  page.params.filter((param) => !['lang', 'locale'].includes(param))

const pictureSrc = (png: string) => `data:image/png;base64,${png}`

const Picture: React.FC<{ page: AppPage; shot: PageShot | undefined }> = ({
  page,
  shot,
}) => (
  <Paper variant="inset" radius="sm" style={{ overflow: 'hidden' }}>
    <AspectRatio ratio={16 / 10}>
      {shot?.png ? (
        <Image
          src={pictureSrc(shot.png)}
          alt={m.pages_picture_alt({ name: String(pageName(page)) })}
          fit="cover"
          style={{ objectPosition: 'top' }}
        />
      ) : (
        <Stack align="center" justify="center" gap={6}>
          <ImageOff size={22} strokeWidth={1.5} />
          <Text size="sm" c="dimmed">
            {STATE[stateOf(page, shot)].label()}
          </Text>
        </Stack>
      )}
    </AspectRatio>
  </Paper>
)

const readablePath = (path: string) =>
  path.replace(/\{-\$([^}]+)\}|\$([\w-]*)/g, (_, optional, name) => {
    const param = optional ?? name
    return param ? `[${humanize(param).toLowerCase()}]` : '…'
  })

const PageRow: React.FC<{
  page: AppPage
  shot: PageShot | undefined
  selected: boolean
  onOpen: () => void
}> = ({ page, shot, selected, onOpen }) => {
  const state = STATE[stateOf(page, shot)]
  return (
    <CardRow
      testId={`page-row-${page.path}`}
      onClick={onOpen}
      selected={selected}
      leading={
        <StatusTile tone={state.tone}>
          <state.Icon size={18} />
        </StatusTile>
      }
      title={pageName(page)}
      meta={
        <Stack gap={6} align="flex-start">
          <span style={{ overflowWrap: 'anywhere' }}>
            {asI18n(readablePath(page.path))}
          </span>
          <StatusBadge tone={state.tone} size="sm">
            {state.label()}
          </StatusBadge>
        </Stack>
      }
      trailing={
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={m.pages_open({ name: String(pageName(page)) })}
          onClick={onOpen}
        >
          <ChevronRight size={16} />
        </ActionIcon>
      }
    >
      <Box mt="sm">
        <Picture page={page} shot={shot} />
      </Box>
    </CardRow>
  )
}

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

export type TakePictures = {
  run: (input: {
    app: string
    pages: AppPage[]
    params?: Record<string, string>
    only?: boolean
  }) => void
  pending: { app: string; only?: string } | null
  error: unknown
}

export const PagesOverviewCards: React.FC<{
  pages: AppPage[]
  shots: PageShots
  searchQuery: string
  address: string
  onAddress: (address: string) => void
  take: TakePictures
  selectedKey: string | null
  onSelect: (key: string) => void
}> = ({
  pages,
  shots,
  searchQuery,
  address,
  onAddress,
  take,
  selectedKey,
  onSelect,
}) => {
  const apps = [...new Set(pages.map((page) => page.app))]
  const query = searchQuery.trim().toLowerCase()
  const shown = pages.filter(
    (page) =>
      !query ||
      [page.path, String(pageName(page))].join(' ').toLowerCase().includes(query)
  )
  const taken = pages.filter((page) => shots[pageKey(page)]?.png).length

  return (
    <>
      <SectionCard
        hero
        testId="pages-hero"
        title={m.pages_hero_title()}
        blurb={
          pages.length === 1
            ? m.pages_hero_blurb_one()
            : m.pages_hero_blurb({ count: pages.length })
        }
      >
        <Group gap="sm" mt="md" align="flex-end" wrap="wrap">
          <TextInput
            data-testid="pages-address"
            label={m.pages_address_label()}
            placeholder={m.pages_address_placeholder()}
            value={address}
            onChange={(event) => onAddress(event.currentTarget.value)}
            w={320}
            maw="100%"
          />
          {apps.length === 1 && (
            <Button
              data-testid="pages-take-all"
              leftSection={<Camera size={16} />}
              disabled={!address.trim()}
              loading={take.pending?.app === apps[0] && !take.pending.only}
              onClick={() => take.run({ app: apps[0]!, pages })}
            >
              {m.pages_take_pictures()}
            </Button>
          )}
        </Group>
        <Text size="sm" c="dimmed" mt="sm">
          {address.trim()
            ? m.pages_pictures_count({ taken, count: pages.length })
            : m.pages_address_needed()}
        </Text>
        {take.error ? (
          <>
            <Group gap={8} mt="sm" wrap="nowrap" align="flex-start">
              <StatusBadge tone="bad" size="sm">
                {m.pages_status_failed()}
              </StatusBadge>
              <Text size="sm">{m.pages_pictures_failed()}</Text>
            </Group>
            <ForDevelopers attached testId="pages-take-error">
              <DevNote>{asI18n(errorText(take.error))}</DevNote>
            </ForDevelopers>
          </>
        ) : null}
      </SectionCard>

      {shown.length === 0 && (
        <SectionCard title={m.pages_no_match()} testId="pages-no-match" />
      )}

      {apps.map((app) => {
        const appPages = shown.filter((page) => page.app === app)
        if (!appPages.length) return null
        return (
          <SectionCard
            key={app}
            testId={`pages-app-${appName(app)}`}
            title={
              apps.length === 1
                ? m.pages_group_all()
                : m.pages_group_app({ app: appName(app) })
            }
            blurb={m.pages_group_blurb()}
            right={
              apps.length > 1 ? (
                <Button
                  variant="light"
                  leftSection={<Camera size={16} />}
                  disabled={!address.trim()}
                  loading={take.pending?.app === app && !take.pending.only}
                  onClick={() =>
                    take.run({
                      app,
                      pages: pages.filter((page) => page.app === app),
                    })
                  }
                >
                  {m.pages_take_pictures()}
                </Button>
              ) : undefined
            }
          >
            <SimpleGrid
              type="container"
              cols={{ base: 1, '560px': 2, '900px': 3 }}
              spacing="sm"
              mt="md"
            >
              {appPages.map((page) => (
                <PageRow
                  key={pageKey(page)}
                  page={page}
                  shot={shots[pageKey(page)]}
                  selected={selectedKey === pageKey(page)}
                  onOpen={() => onSelect(pageKey(page))}
                />
              ))}
            </SimpleGrid>
          </SectionCard>
        )
      })}

      <ForDevelopers testId="pages-developers" hint={m.pages_dev_hint()}>
        <DevNote>{m.pages_dev_routes()}</DevNote>
        <DevFields>
          <DevField label={m.pages_dev_app()} value={apps.join(', ')} />
        </DevFields>
        <DevCode
          label={m.pages_dev_cli()}
          code={apps
            .map(
              (app) =>
                `pikku pages screenshot --base-url ${address.trim() || 'http://localhost:5173'}${apps.length > 1 ? ` --app ${app}` : ''}`
            )
            .join('\n')}
        />
        <DevNote>{m.pages_dev_signed_out()}</DevNote>
        <DevNote>{m.pages_dev_not_saved()}</DevNote>
      </ForDevelopers>
    </>
  )
}

export const PageDetailPanel: React.FC<{
  page: AppPage
  shot: PageShot | undefined
  address: string
  take: TakePictures
  onClose: () => void
}> = ({ page, shot, address, take, onClose }) => {
  const { locale } = useLocale()
  const [examples, setExamples] = useState<Record<string, string>>({})
  const needed = examplesFor(page)
  const missing = needed.some((param) => !examples[param]?.trim())
  const path = fillPagePath(page.path, examples)
  const base = address.trim().replace(/\/+$/, '')
  const state = STATE[stateOf(page, shot)]
  const time = shot
    ? new Intl.DateTimeFormat([locale], { timeStyle: 'short' }).format(
        shot.takenAt
      )
    : null

  return (
    <Box
      style={{ flex: 1, minHeight: 0, overflow: 'auto' }}
      p="md"
      data-testid="page-detail"
    >
      <Stack gap="md">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Stack gap={6} miw={0}>
            <Title order={3}>{pageName(page)}</Title>
            <Group gap={8}>
              <StatusBadge tone={state.tone} size="sm">
                {state.label()}
              </StatusBadge>
            </Group>
          </Stack>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={m.common_close()}
            onClick={onClose}
          >
            <X size={16} />
          </ActionIcon>
        </Group>

        <Picture page={page} shot={shot} />
        {time && (
          <Text size="sm" c="dimmed">
            {m.pages_taken_at({ time })}
          </Text>
        )}

        {shot && stateOf(page, shot) === 'failed' && (
          <Text size="sm">{m.pages_failed_open()}</Text>
        )}
        {shot && shot.problems.length > 0 && (
          <Text size="sm">
            {shot.problems.length === 1
              ? m.pages_problems_one()
              : m.pages_problems({ count: shot.problems.length })}
          </Text>
        )}

        {needed.length > 0 && (
          <Stack gap="xs">
            <Text fw={600}>{m.pages_example_title()}</Text>
            <Text size="sm" c="dimmed">
              {m.pages_example_blurb()}
            </Text>
            {needed.map((param) => (
              <TextInput
                key={param}
                label={asI18n(humanize(param))}
                value={examples[param] ?? ''}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  setExamples((old) => ({ ...old, [param]: value }))
                }}
              />
            ))}
          </Stack>
        )}

        <Group gap="sm" wrap="wrap">
          <Button
            data-testid="page-take-one"
            leftSection={<Camera size={16} />}
            disabled={!base || missing}
            loading={take.pending?.only === pageKey(page)}
            onClick={() =>
              take.run({
                app: page.app,
                pages: [page],
                params: needed.length ? examples : undefined,
                only: true,
              })
            }
          >
            {m.pages_take_picture()}
          </Button>
          {base && path && (
            <Anchor
              href={`${base}${path}`}
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
            >
              <Group gap={4} wrap="nowrap" component="span">
                {m.pages_open_in_app()}
                <ExternalLink size={12} />
              </Group>
            </Anchor>
          )}
        </Group>
        {!base && (
          <Text size="sm" c="dimmed">
            {m.pages_address_needed()}
          </Text>
        )}

        <ForDevelopers testId="page-detail-developers" hint={m.pages_dev_hint()}>
          <DevFields>
            <DevField label={m.pages_dev_app()} value={page.app} />
            <DevField label={m.pages_dev_path()} value={page.path} />
            <DevField label={m.pages_dev_file()} value={page.file} />
            <DevField
              label={m.pages_dev_params()}
              value={page.params.join(', ') || '—'}
            />
            {shot && (
              <DevField
                label={m.pages_dev_status()}
                value={shot.httpStatus === null ? '—' : String(shot.httpStatus)}
              />
            )}
          </DevFields>
          {shot?.error ? <DevNote>{asI18n(shot.error)}</DevNote> : null}
          {shot && shot.problems.length > 0 && (
            <Stack gap={4}>
              <Text size="sm" c="dimmed">
                {m.pages_dev_problems()}
              </Text>
              {shot.problems.map((problem, index) => (
                <Text
                  key={index}
                  size="sm"
                  ff="monospace"
                  style={{ overflowWrap: 'anywhere' }}
                >
                  {asI18n(problem)}
                </Text>
              ))}
            </Stack>
          )}
        </ForDevelopers>
      </Stack>
    </Box>
  )
}
