import React, { useMemo, useState } from 'react'
import { Button, Collapse, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n, type I18nNode } from '@pikku/react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader as Spinner,
  Send,
  X,
} from 'lucide-react'
import type { OutgoingWebhookMeta } from '@pikku/core/webhook'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import {
  useWebhookDeliveries,
  useWebhookDelivery,
  type WebhookDelivery,
} from '../../hooks/useWebhookDeliveries'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { SectionCard } from '../ui/SectionCard'
import { CardRow } from '../ui/CardRow'
import { StatusTile } from '../ui/StatusTile'
import { StatusBadge, type StatusTone } from '../ui/StatusBadge'
import { ForDevelopers } from '../ui/ForDevelopers'
import { runAgo } from '../scenarios/runs/scenario-run-format'
import { ConsoleLoading } from '../ui/ConsoleLoading'

const LOOK: Record<
  WebhookDelivery['status'],
  { tone: StatusTone; Icon: typeof Check; label: () => string }
> = {
  delivered: {
    tone: 'good',
    Icon: Check,
    label: m.webhooks_delivery_delivered,
  },
  failed: { tone: 'bad', Icon: X, label: m.webhooks_delivery_failed },
  pending: { tone: 'info', Icon: Spinner, label: m.webhooks_delivery_pending },
}

type AppWebhook = {
  key: string
  url: string
  event: string | null
  deliveries: WebhookDelivery[]
}

type DeclaredWebhook = {
  definition: OutgoingWebhookMeta
  addresses: AppWebhook[]
  deliveries: WebhookDelivery[]
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

const words = (text: string) => {
  const spaced = text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._:-]+/g, ' ')
    .trim()
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

const nameOf = (hook: AppWebhook): I18nNode =>
  hook.event
    ? asI18n(words(hook.event))
    : m.webhooks_unnamed({ host: hostOf(hook.url) })

const triesOf = (count: number) =>
  count === 1 ? m.webhooks_tries_one() : m.webhooks_tries({ count })

const addressesOf = (count: number) =>
  count === 1
    ? m.webhooks_meta_addresses_one()
    : m.webhooks_meta_addresses({ count })

const newest = (a: WebhookDelivery, b: WebhookDelivery) =>
  b.createdAt.localeCompare(a.createdAt)

const groupWebhooks = (deliveries: WebhookDelivery[]): AppWebhook[] => {
  const byKey = new Map<string, AppWebhook>()
  for (const d of deliveries) {
    const key = `${d.event ?? ''} ${d.url}`
    const hook = byKey.get(key) ?? {
      key,
      url: d.url,
      event: d.event,
      deliveries: [],
    }
    hook.deliveries.push(d)
    byKey.set(key, hook)
  }
  const hooks = [...byKey.values()]
  for (const hook of hooks) hook.deliveries.sort(newest)
  return hooks.sort((a, b) => newest(a.deliveries[0]!, b.deliveries[0]!))
}

const DeliveryLine: React.FC<{ delivery: WebhookDelivery; locale: string }> = ({
  delivery,
  locale,
}) => (
  <Group gap="sm" wrap="wrap">
    <StatusBadge tone={LOOK[delivery.status].tone} size="sm">
      {asI18n(LOOK[delivery.status].label())}
    </StatusBadge>
    <Text size="sm" c="dimmed">
      {asI18n(
        `${runAgo(delivery.createdAt, locale)} · ${triesOf(delivery.attempts)}`
      )}
    </Text>
  </Group>
)

const RowToggle: React.FC<{
  open: boolean
  onToggle: () => void
  label: I18nNode
}> = ({ open, onToggle, label }) => {
  const Toggle = open ? ChevronDown : ChevronRight
  return (
    <Button
      variant="subtle"
      size="xs"
      leftSection={<Toggle size={14} />}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      aria-expanded={open}
    >
      {label}
    </Button>
  )
}

const DeclaredRow: React.FC<{ hook: DeclaredWebhook; locale: string }> = ({
  hook,
  locale,
}) => {
  const [open, setOpen] = useState(false)
  const { definition, addresses, deliveries } = hook
  const latest = deliveries[0]
  const look = latest ? LOOK[latest.status] : undefined
  const failed = deliveries.filter((d) => d.status === 'failed').length
  const fields = Object.keys(definition.payload ?? {}).map(words)
  const meta = latest
    ? [
        m.webhooks_meta_last({ when: runAgo(latest.createdAt, locale) }),
        addressesOf(addresses.length),
        ...(failed ? [m.webhooks_meta_failed({ count: failed })] : []),
      ].join(' · ')
    : definition.description

  return (
    <CardRow
      testId={`webhooks-declared-${definition.event}`}
      leading={
        <StatusTile tone={look?.tone ?? 'neutral'}>
          {look ? <look.Icon size={18} /> : <Send size={18} />}
        </StatusTile>
      }
      title={asI18n(definition.title)}
      badges={
        <StatusBadge tone={look?.tone ?? 'neutral'} size="sm">
          {look ? asI18n(look.label()) : m.webhooks_not_sent()}
        </StatusBadge>
      }
      meta={meta ? asI18n(meta) : undefined}
      onClick={() => setOpen((o) => !o)}
      trailing={
        <RowToggle
          open={open}
          onToggle={() => setOpen((o) => !o)}
          label={m.webhooks_details()}
        />
      }
    >
      <Collapse expanded={open}>
        <Stack gap="md" pt="sm" onClick={(event) => event.stopPropagation()}>
          {latest && definition.description && (
            <Text size="sm" c="dimmed">
              {asI18n(definition.description)}
            </Text>
          )}
          <Stack gap={4}>
            <Text size="sm" fw={600}>
              {m.webhooks_carries()}
            </Text>
            <Text size="sm" c="dimmed">
              {fields.length
                ? asI18n(fields.join(', '))
                : m.webhooks_carries_unknown()}
            </Text>
          </Stack>
          {latest ? (
            <Stack gap={4}>
              <Text size="sm" fw={600}>
                {m.webhooks_goes_to({ count: addresses.length })}
              </Text>
              {addresses.map((address) => (
                <Stack key={address.key} gap={4} pt={4}>
                  <Text size="sm">{asI18n(hostOf(address.url))}</Text>
                  {address.deliveries.slice(0, 5).map((d) => (
                    <DeliveryLine
                      key={d.deliveryId}
                      delivery={d}
                      locale={locale}
                    />
                  ))}
                </Stack>
              ))}
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">
              {m.webhooks_goes_to_none()}
            </Text>
          )}
        </Stack>
      </Collapse>
    </CardRow>
  )
}

const OtherRow: React.FC<{ hook: AppWebhook; locale: string }> = ({
  hook,
  locale,
}) => {
  const [open, setOpen] = useState(false)
  const latest = hook.deliveries[0]!
  const look = LOOK[latest.status]
  const failed = hook.deliveries.filter((d) => d.status === 'failed').length
  const meta = [
    m.webhooks_meta_last({ when: runAgo(latest.createdAt, locale) }),
    m.webhooks_meta_sent({ count: hook.deliveries.length }),
    ...(failed ? [m.webhooks_meta_failed({ count: failed })] : []),
  ].join(' · ')

  return (
    <CardRow
      testId={`webhooks-row-${hook.key}`}
      leading={
        <StatusTile tone={look.tone}>
          <look.Icon size={18} />
        </StatusTile>
      }
      title={nameOf(hook)}
      badges={
        <StatusBadge tone={look.tone} size="sm">
          {asI18n(look.label())}
        </StatusBadge>
      }
      meta={asI18n(meta)}
      onClick={() => setOpen((o) => !o)}
      trailing={
        <RowToggle
          open={open}
          onToggle={() => setOpen((o) => !o)}
          label={m.webhooks_recent()}
        />
      }
    >
      <Collapse expanded={open}>
        <Stack gap={6} pt="sm">
          {hook.deliveries.slice(0, 8).map((d) => (
            <DeliveryLine key={d.deliveryId} delivery={d} locale={locale} />
          ))}
        </Stack>
      </Collapse>
    </CardRow>
  )
}

const DevDeclared: React.FC<{ definition: OutgoingWebhookMeta }> = ({
  definition,
}) => (
  <Stack gap={2}>
    <Text size="sm" fw={600}>
      {asI18n(definition.title)}
    </Text>
    <Text
      size="xs"
      c="dimmed"
      ff="monospace"
      style={{ wordBreak: 'break-all' }}
    >
      {asI18n(`${m.webhooks_dev_event()}: ${definition.event}`)}
    </Text>
    {Object.entries(definition.payload ?? {}).map(([key, schema]) => (
      <Text
        key={key}
        size="xs"
        c="dimmed"
        ff="monospace"
        style={{ wordBreak: 'break-all' }}
      >
        {asI18n(`${m.webhooks_dev_payload()}.${key}: ${schema}`)}
      </Text>
    ))}
    {definition.exportedName && (
      <Text
        size="xs"
        c="dimmed"
        ff="monospace"
        style={{ wordBreak: 'break-all' }}
      >
        {asI18n(
          `${m.webhooks_dev_declared_in()}: ${definition.exportedName}${
            definition.sourceFile
              ? ` · ${definition.sourceFile.split('/').slice(-2).join('/')}`
              : ''
          }`
        )}
      </Text>
    )}
  </Stack>
)

const DevWebhook: React.FC<{ hook: AppWebhook }> = ({ hook }) => {
  const { data } = useWebhookDelivery(hook.deliveries[0]!.deliveryId)
  return (
    <Stack gap={2}>
      <Text size="sm" fw={600}>
        {nameOf(hook)}
      </Text>
      <Text
        size="xs"
        c="dimmed"
        ff="monospace"
        style={{ wordBreak: 'break-all' }}
      >
        {asI18n(
          `${m.webhooks_dev_event()}: ${hook.event ?? m.webhooks_dev_none()}`
        )}
      </Text>
      <Text
        size="xs"
        c="dimmed"
        ff="monospace"
        style={{ wordBreak: 'break-all' }}
      >
        {asI18n(`${m.webhooks_dev_address()}: ${hook.url}`)}
      </Text>
      {data?.attempts.map((a) => (
        <Text
          key={a.attemptId}
          size="xs"
          c="dimmed"
          ff="monospace"
          lineClamp={2}
          style={{ wordBreak: 'break-all' }}
        >
          {asI18n(
            `${m.webhooks_dev_attempt({ number: a.attemptNumber })}: ${
              a.statusCode ?? m.webhooks_dev_no_answer()
            }${a.error ? ` · ${a.error}` : ''}${a.responseBody ? ` · ${a.responseBody}` : ''}`
          )}
        </Text>
      ))}
    </Stack>
  )
}

export const WebhooksCards: React.FC = () => {
  const { locale } = useLocale()
  const { meta } = usePikkuMeta()
  const { data: deliveries = [], isLoading } = useWebhookDeliveries()

  const { declared, other } = useMemo(() => {
    const definitions = Object.values(meta.outgoingWebhooksMeta ?? {}).sort(
      (a, b) => a.title.localeCompare(b.title)
    )
    const known = new Set(definitions.map((d) => d.event))
    const hooks = groupWebhooks(deliveries)
    return {
      declared: definitions.map((definition): DeclaredWebhook => {
        const addresses = hooks.filter((h) => h.event === definition.event)
        return {
          definition,
          addresses,
          deliveries: addresses.flatMap((a) => a.deliveries).sort(newest),
        }
      }),
      other: hooks.filter((h) => !h.event || !known.has(h.event)),
    }
  }, [meta.outgoingWebhooksMeta, deliveries])

  const failing =
    declared.filter((h) => h.deliveries[0]?.status === 'failed').length +
    other.filter((h) => h.deliveries[0]!.status === 'failed').length
  const overall: { tone: StatusTone; label: string } | null =
    deliveries.length === 0
      ? null
      : failing
        ? { tone: 'bad', label: m.webhooks_state_failing({ count: failing }) }
        : { tone: 'good', label: m.webhooks_state_ok() }
  const empty = declared.length === 0 && other.length === 0

  const developers = (
    <ForDevelopers
      attached
      testId="webhooks-dev"
      label={m.webhooks_dev_label()}
      hint={m.webhooks_dev_hint()}
    >
      <Text size="sm" c="dimmed">
        {m.webhooks_dev_signing()}
      </Text>
      <Text size="sm" c="dimmed">
        {m.webhooks_dev_declare()}
      </Text>
      {declared.map((hook) => (
        <DevDeclared key={hook.definition.event} definition={hook.definition} />
      ))}
      {[...declared.flatMap((h) => h.addresses), ...other].map((hook) => (
        <DevWebhook key={hook.key} hook={hook} />
      ))}
    </ForDevelopers>
  )

  return (
    <Stack gap="lg">
      <SectionCard
        testId="webhooks-list"
        footer={other.length === 0 ? developers : undefined}
        title={m.webhooks_list_title()}
        blurb={m.webhooks_list_blurb()}
        right={
          overall && (
            <StatusBadge tone={overall.tone}>
              {asI18n(overall.label)}
            </StatusBadge>
          )
        }
      >
        <Stack gap="sm" mt="md">
          {isLoading ? (
            <ConsoleLoading py="xl" />
          ) : empty ? (
            <Group gap="sm" wrap="nowrap" py="sm" data-testid="webhooks-empty">
              <StatusTile tone="neutral">
                <Send size={18} />
              </StatusTile>
              <Text size="sm" c="dimmed">
                {m.webhooks_empty()}
              </Text>
            </Group>
          ) : declared.length === 0 ? (
            <Text size="sm" c="dimmed" data-testid="webhooks-none-declared">
              {m.webhooks_none_declared()}
            </Text>
          ) : (
            declared.map((hook) => (
              <DeclaredRow
                key={hook.definition.event}
                hook={hook}
                locale={locale}
              />
            ))
          )}
        </Stack>
      </SectionCard>
      {other.length > 0 && (
        <SectionCard
          testId="webhooks-other"
          footer={developers}
          title={m.webhooks_other_title()}
          blurb={m.webhooks_other_blurb()}
        >
          <Stack gap="sm" mt="md">
            {other.map((hook) => (
              <OtherRow key={hook.key} hook={hook} locale={locale} />
            ))}
          </Stack>
        </SectionCard>
      )}
    </Stack>
  )
}
