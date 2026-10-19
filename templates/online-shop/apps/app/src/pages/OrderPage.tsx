import { useState, type FC } from 'react'
import {
  Alert, Anchor, Badge, Box, Button, Card, Divider, Group, Skeleton, Stack, Text, Title,
} from '@pikku/mantine/core'
import { Link } from '@tanstack/react-router'
import { QueryErrorCard } from '@/components/QueryErrorCard'
import { STATUS_TEXT_COLOR } from '@/lib/status-color'
import { usePikkuQuery, usePikkuMutation } from '@project/functions-sdk/pikku/api.gen'
import { m, asI18n } from '@/i18n/messages'
import { orderStatus } from '@/i18n/i18n-enum.gen'
import type { OrderStatusKey } from '@/i18n/i18n-enum.gen'
import { useLocale } from '@/i18n/config'

const money = (cents: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'GBP' }).format(cents / 100)

const STATUS_COLOR: Record<string, string> = {
  pending: 'gray', paid: 'teal', payment_failed: 'red',
  shipped: 'blue', cancelled: 'orange', refunded: 'violet',
}

type Props = { orderId: string }

/**
 * One order, and the only thing a customer ever wants to do to one.
 *
 * `getOrder` and `cancelOrder` were both wired and unreachable: the orders list
 * showed a row and opened nothing, so a shopper could see that they had bought
 * something and could neither read what was in it nor change their mind.
 */
export const OrderPage: FC<Props> = ({ orderId }) => {
  useLocale()
  const order = usePikkuQuery('getOrder', { orderId })
  const cancelOrder = usePikkuMutation('cancelOrder')
  // Refunding is a different act from cancelling: cancelling stops an order that
  // has not shipped, refunding returns money for one that has. The workflow
  // behind this — check eligibility, then issue — existed in full and had no way
  // in, so a paid order could never be refunded from anywhere.
  const startRefund = usePikkuMutation('startRefund')
  const [failed, setFailed] = useState(false)

  if (order.isLoading) return <Skeleton h={240} radius="md" />
  if (order.isError) {
    return <QueryErrorCard error={order.error} onRetry={() => void order.refetch()} />
  }

  const data = order.data!
  const cancellable = data.status === 'pending' || data.status === 'paid'
  // Only money that was actually taken can be given back. The workflow checks
  // this again server-side — this only decides whether to offer the button.
  const refundable = data.status === 'paid' || data.status === 'shipped'
  const address = data.shippingAddress as Record<string, string>

  return (
    <Stack gap="lg" maw={720}>
      <Anchor component={Link} to="/app/orders" size="sm">
        {m.order__back()}
      </Anchor>

      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Box>
          <Title order={1} fz={30} fw={650} style={{ letterSpacing: '-0.02em' }}>
            {m.order__title({ ref: data.orderId.slice(0, 8) })}
          </Title>
        </Box>
        <Badge
          size="lg"
          variant="light"
          color={STATUS_COLOR[data.status] ?? 'gray'}
          styles={{ label: { color: STATUS_TEXT_COLOR } }}
        >
          {orderStatus[data.status as OrderStatusKey]?.() ?? asI18n(data.status)}
        </Badge>
      </Group>

      {failed && (
        <Alert color="red" variant="light">
          {m.order__cancel_failed()}
        </Alert>
      )}

      <Card withBorder radius="md" padding="lg">
        <Stack gap="sm">
          {data.items.map((line) => (
            <Group key={line.itemId} justify="space-between" wrap="nowrap">
              <Text size="sm">{asI18n(`${line.quantity} × ${line.name}`)}</Text>
              <Text size="sm" fw={600} style={{ flexShrink: 0 }}>
                {asI18n(money(line.lineTotalCents))}
              </Text>
            </Group>
          ))}
          <Divider />
          <Group justify="space-between">
            <Text fw={600}>{m.order__total()}</Text>
            <Text fw={700} fz="lg">{asI18n(money(data.totalCents))}</Text>
          </Group>
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Stack gap={4}>
          <Text fw={600} size="sm">{m.order__shipping()}</Text>
          <Text c="dimmed" size="sm">
            {asI18n([address.line1, address.line2, address.city, address.postcode, address.country]
              .filter(Boolean)
              .join(', '))}
          </Text>
        </Stack>
      </Card>

      <Group>
        {refundable && (
          <Button
            variant="light"
            color="violet"
            loading={startRefund.isPending}
            onClick={() =>
              startRefund
                .mutateAsync({ orderId, reason: 'requested_by_customer' })
                .then(() => order.refetch())
                .catch(() => setFailed(true))
            }
          >
            {m.order__refund()}
          </Button>
        )}
      </Group>

      {cancellable && (
        <Group>
          <Button
            variant="default"
            color="red"
            loading={cancelOrder.isPending}
            onClick={() =>
              cancelOrder
                .mutateAsync({ orderId })
                .then(() => order.refetch())
                .catch(() => setFailed(true))
            }
          >
            {m.order__cancel()}
          </Button>
        </Group>
      )}
    </Stack>
  )
}
