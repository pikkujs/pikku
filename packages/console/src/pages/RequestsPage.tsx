import React, { useState } from 'react'
import {
  Button,
  Group,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@pikku/mantine/core'
import { PenLine } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ListPageHeader } from '../components/layout/PageLayout'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { CardsPage } from '../components/ui/CardsPage'
import { SectionCard } from '../components/ui/SectionCard'
import { SummaryCard } from '../components/ui/SummaryCard'
import { CardRow } from '../components/ui/CardRow'
import { StatusBadge } from '../components/ui/StatusBadge'
import { ConsoleLoading } from '../components/ui/ConsoleLoading'
import { WishDeck } from '../components/studio/WishDeck'
import {
  useStudioChangeAction,
  useStudioChanges,
  type StudioChange,
} from '../hooks/useStudio'

type Section = 'blocked' | 'working' | 'waiting' | 'finished'

const sectionOf = (change: StudioChange): Section => {
  if (change.status === 'needs_answer') return 'blocked'
  if (change.status === 'claimed' || change.status === 'in_progress')
    return 'working'
  if (change.status === 'open') return 'waiting'
  return 'finished'
}

const age = (iso: string) => {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  )
  if (seconds < 60) return m.requests_age_now()
  if (seconds < 3600)
    return m.requests_age_minutes({ count: Math.floor(seconds / 60) })
  if (seconds < 86400)
    return m.requests_age_hours({ count: Math.floor(seconds / 3600) })
  return m.requests_age_days({ count: Math.floor(seconds / 86400) })
}

const filedBy = (change: StudioChange) => {
  if (change.source === 'panel') return m.requests_filed_panel()
  if (change.source === 'system') return m.requests_filed_system()
  return m.requests_filed_you()
}

const NewRequest: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const action = useStudioChangeAction()
  const submit = () =>
    action.mutate(
      { kind: 'create', title: title.trim(), body: body.trim() || undefined },
      { onSuccess: onDone }
    )
  return (
    <SectionCard
      testId="requests-new"
      title={m.requests_new_title()}
      blurb={m.requests_new_blurb()}
    >
      <Stack gap="sm" mt="md">
        <TextInput
          label={m.requests_new_what()}
          placeholder={m.requests_new_what_placeholder()}
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          data-autofocus
          data-testid="requests-new-title"
        />
        <Textarea
          label={m.requests_new_detail()}
          autosize
          minRows={3}
          value={body}
          onChange={(e) => setBody(e.currentTarget.value)}
        />
        {action.error && (
          <Text size="sm" c="red">
            {asI18n(action.error.message)}
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            {m.requests_cancel()}
          </Button>
          <Button
            onClick={submit}
            disabled={!title.trim()}
            loading={action.isPending}
            data-testid="requests-new-submit"
          >
            {m.requests_new_submit()}
          </Button>
        </Group>
      </Stack>
    </SectionCard>
  )
}

const RequestRow: React.FC<{ change: StudioChange }> = ({ change }) => {
  const action = useStudioChangeAction()
  const section = sectionOf(change)
  const busy = action.isPending
  const tag = { 'data-title': change.title }
  return (
    <div
      data-testid="request-row"
      data-title={change.title}
      data-section={section}
    >
      <CardRow
        title={asI18n(change.title)}
        meta={
          change.route
            ? m.requests_row_meta({
                who: filedBy(change),
                when: age(change.createdAt),
                where: asI18n(change.route),
              })
            : m.requests_row_meta_short({
                who: filedBy(change),
                when: age(change.createdAt),
              })
        }
        trailing={
          <Group gap="xs" wrap="nowrap">
            {section === 'waiting' && (
              <Button
                data-testid="request-start"
                {...tag}
                size="xs"
                variant="default"
                loading={busy}
                onClick={() =>
                  action.mutate({
                    kind: 'status',
                    changeId: change.changeId,
                    status: 'in_progress',
                  })
                }
              >
                {m.requests_start()}
              </Button>
            )}
            {(section === 'waiting' ||
              section === 'working' ||
              section === 'blocked') && (
              <>
                <Button
                  data-testid="request-done"
                  {...tag}
                  size="xs"
                  loading={busy}
                  onClick={() =>
                    action.mutate({
                      kind: 'complete',
                      changeId: change.changeId,
                    })
                  }
                >
                  {m.requests_done()}
                </Button>
                <Button
                  data-testid="request-dismiss"
                  {...tag}
                  size="xs"
                  variant="subtle"
                  color="gray"
                  loading={busy}
                  onClick={() =>
                    action.mutate({
                      kind: 'status',
                      changeId: change.changeId,
                      status: 'dismissed',
                    })
                  }
                >
                  {m.requests_dismiss()}
                </Button>
              </>
            )}
            {section === 'finished' && (
              <Button
                data-testid="request-reopen"
                {...tag}
                size="xs"
                variant="default"
                loading={busy}
                onClick={() =>
                  action.mutate({
                    kind: 'status',
                    changeId: change.changeId,
                    status: 'open',
                  })
                }
              >
                {m.requests_reopen()}
              </Button>
            )}
          </Group>
        }
      >
        {change.body && (
          <Text size="sm" c="dimmed" lineClamp={3}>
            {asI18n(change.body)}
          </Text>
        )}
      </CardRow>
    </div>
  )
}

export const RequestsPage: React.FC = () => {
  useLocale()
  const { data, isLoading, error } = useStudioChanges()
  const [writing, setWriting] = useState(false)
  const [showFinished, setShowFinished] = useState(false)
  const mode = data?.mode ?? 'local'
  const changes = data?.changes ?? []

  const sections: Record<Section, StudioChange[]> = {
    blocked: [],
    working: [],
    waiting: [],
    finished: [],
  }
  for (const change of changes) sections[sectionOf(change)].push(change)
  const open = changes.length - sections.finished.length

  const header = (
    <ListPageHeader
      title={m.requests_title()}
      description={
        mode === 'fabric'
          ? m.requests_description_fabric()
          : m.requests_description_local()
      }
      actions={
        mode === 'local'
          ? [
              {
                key: 'new',
                label: m.requests_new(),
                icon: <PenLine size={14} />,
                variant: 'primary',
                testId: 'requests-new-open',
                onClick: () => setWriting(true),
              },
            ]
          : []
      }
    />
  )

  if (isLoading) {
    return (
      <ConsoleSurface>
        <ResizablePanelLayout hidePanel header={header}>
          <ConsoleLoading />
        </ResizablePanelLayout>
      </ConsoleSurface>
    )
  }

  const list = (items: StudioChange[]) => (
    <Stack gap="xs" mt="md">
      {items.map((change) => (
        <RequestRow key={change.changeId} change={change} />
      ))}
    </Stack>
  )

  return (
    <ConsoleSurface>
      <ResizablePanelLayout hidePanel header={header} surface="cards">
        <CardsPage>
          {error && (
            <Text size="sm" c="red">
              {m.requests_load_failed({ reason: asI18n(error.message) })}
            </Text>
          )}
          {writing && <NewRequest onDone={() => setWriting(false)} />}
          {changes.length === 0 ? (
            <SectionCard
              hero
              testId="requests-empty"
              title={m.requests_empty_title()}
              blurb={
                mode === 'fabric'
                  ? m.requests_empty_description_fabric()
                  : m.requests_empty_description_local()
              }
              right={
                mode === 'local' && !writing ? (
                  <Button
                    leftSection={<PenLine size={14} />}
                    onClick={() => setWriting(true)}
                  >
                    {m.requests_new()}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <SummaryCard
              testId="requests-summary"
              eyebrow={
                <StatusBadge tone={mode === 'fabric' ? 'info' : 'neutral'}>
                  {mode === 'fabric'
                    ? m.requests_mode_fabric()
                    : m.requests_mode_local()}
                </StatusBadge>
              }
              title={
                open === 0
                  ? m.requests_hero_clear()
                  : open === 1
                    ? m.requests_hero_open_one()
                    : m.requests_hero_open({ count: open })
              }
              blurb={
                mode === 'fabric'
                  ? m.requests_hero_body_fabric()
                  : m.requests_hero_body_local()
              }
              facts={[
                {
                  label: m.requests_fact_blocked(),
                  value: asI18n(String(sections.blocked.length)),
                  tone: sections.blocked.length ? 'warn' : undefined,
                },
                {
                  label: m.requests_fact_working(),
                  value: asI18n(String(sections.working.length)),
                },
                {
                  label: m.requests_fact_waiting(),
                  value: asI18n(String(sections.waiting.length)),
                },
                {
                  label: m.requests_fact_finished(),
                  value: asI18n(String(sections.finished.length)),
                },
              ]}
            />
          )}
          {sections.blocked.length > 0 && (
            <SectionCard
              testId="requests-blocked"
              title={m.requests_section_blocked()}
              blurb={m.requests_section_blocked_blurb()}
            >
              {list(sections.blocked)}
            </SectionCard>
          )}
          {sections.working.length > 0 && (
            <SectionCard
              testId="requests-working"
              title={m.requests_section_working()}
              blurb={m.requests_section_working_blurb()}
            >
              {list(sections.working)}
            </SectionCard>
          )}
          {sections.waiting.length > 0 && (
            <SectionCard
              testId="requests-waiting"
              title={m.requests_section_waiting()}
              blurb={m.requests_section_waiting_blurb()}
            >
              {list(sections.waiting)}
            </SectionCard>
          )}
          {sections.finished.length > 0 && (
            <SectionCard
              testId="requests-finished"
              title={m.requests_section_finished()}
              subtitle={asI18n(String(sections.finished.length))}
              right={
                <Button
                  variant="default"
                  onClick={() => setShowFinished((v) => !v)}
                >
                  {showFinished ? m.requests_hide() : m.requests_show()}
                </Button>
              }
            >
              {showFinished && list(sections.finished)}
            </SectionCard>
          )}
          <WishDeck />
        </CardsPage>
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
