import React, { useMemo, useState } from 'react'
import {
  Badge,
  Code,
  Drawer,
  Group,
  ScrollArea,
  Stack,
  Text,
} from '@pikku/mantine/core'
import { Webhook } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { useLocale } from '@/i18n/config'
import {
  useWebhookDeliveries,
  useWebhookDelivery,
  type WebhookDelivery,
} from '../../hooks/useWebhookDeliveries'
import { TableListPage } from '../layout/TableListPage'

const STATUS_COLOR: Record<WebhookDelivery['status'], string> = {
  delivered: 'green',
  failed: 'red',
  pending: 'yellow',
}

export interface WebhooksListPanelProps {
  /** Filters the rows from outside; omit to use the panel's own search input. */
  externalSearch?: string
  emptyHero?: React.ReactNode
}

/**
 * Outgoing webhook deliveries as selectable rows, with the attempt history in a
 * drawer. Self-contained — it owns both the query and the selection, so it can
 * be mounted anywhere.
 */
export const WebhooksListPanel: React.FC<WebhooksListPanelProps> = ({
  externalSearch,
  emptyHero,
}) => {
  useLocale()
  const [selected, setSelected] = useState<string | null>(null)
  const { data: deliveries = [], isLoading } = useWebhookDeliveries()
  const { data: detail } = useWebhookDelivery(selected)

  const columns = useMemo(
    () => [
      {
        key: 'url',
        header: 'URL',
        render: (item: WebhookDelivery) => (
          <>
            <Text fw={500} truncate>
              {asI18n(item.url)}
            </Text>
            {item.event && (
              <Text size="sm" c="dimmed" truncate>
                {asI18n(item.event)}
              </Text>
            )}
          </>
        ),
      },
      {
        key: 'status',
        header: 'STATUS',
        render: (item: WebhookDelivery) => (
          <Badge color={STATUS_COLOR[item.status]} variant="light">
            {asI18n(item.status)}
          </Badge>
        ),
      },
      {
        key: 'attempts',
        header: 'ATTEMPTS',
        align: 'right' as const,
        render: (item: WebhookDelivery) => (
          <Text>{asI18n(String(item.attempts))}</Text>
        ),
      },
    ],
    []
  )

  return (
    <>
      <TableListPage
        title="Webhooks"
        icon={Webhook}
        docsHref="https://pikku.dev/docs/wiring/webhook"
        data={deliveries}
        columns={columns}
        getKey={(item) => item.deliveryId}
        onRowClick={(item) => setSelected(item.deliveryId)}
        externalSearch={externalSearch}
        searchFilter={(item, q) =>
          item.url.toLowerCase().includes(q) ||
          item.event?.toLowerCase().includes(q) ||
          false
        }
        emptyMessage={asI18n('No webhook deliveries yet')}
        emptyHero={emptyHero}
        loading={isLoading}
      />

      <Drawer
        opened={!!selected}
        onClose={() => setSelected(null)}
        position="right"
        size="lg"
        title={asI18n('Delivery attempts')}
      >
        {detail && (
          <Stack gap="md">
            <Stack gap={4}>
              <Text fw={500} truncate>
                {asI18n(detail.delivery.url)}
              </Text>
              <Group gap="xs">
                <Badge
                  color={STATUS_COLOR[detail.delivery.status]}
                  variant="light"
                >
                  {asI18n(detail.delivery.status)}
                </Badge>
                {detail.delivery.event && (
                  <Text size="sm" c="dimmed">
                    {asI18n(detail.delivery.event)}
                  </Text>
                )}
              </Group>
            </Stack>

            {detail.attempts.map((attempt) => (
              <Stack key={attempt.attemptId} gap={4}>
                <Group gap="xs">
                  <Text fw={500}>
                    {asI18n(`#${attempt.attemptNumber}`)}
                  </Text>
                  {attempt.statusCode != null && (
                    <Badge
                      color={
                        attempt.statusCode >= 200 && attempt.statusCode < 300
                          ? 'green'
                          : 'red'
                      }
                      variant="light"
                    >
                      {asI18n(String(attempt.statusCode))}
                    </Badge>
                  )}
                  <Text size="sm" c="dimmed">
                    {asI18n(new Date(attempt.createdAt).toLocaleString())}
                  </Text>
                </Group>
                {attempt.error && (
                  <Text size="sm" c="red">
                    {asI18n(attempt.error)}
                  </Text>
                )}
                {attempt.responseBody && (
                  <ScrollArea.Autosize mah={160}>
                    <Code block>{asI18n(attempt.responseBody)}</Code>
                  </ScrollArea.Autosize>
                )}
              </Stack>
            ))}
          </Stack>
        )}
      </Drawer>
    </>
  )
}
