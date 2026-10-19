import type { FC } from 'react'
import {
  Alert,
  Badge,
  Box,
  Card,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
} from '@pikku/mantine/core'
import { QueryErrorCard } from '@/components/QueryErrorCard'
import { STATUS_TEXT_COLOR } from '@/lib/status-color'
import { usePikkuQuery } from '@project/functions-sdk/pikku/api.gen'
import { m, asI18n } from '@/i18n/messages'
import { orderStatus } from '@/i18n/i18n-enum.gen'
import type { OrderStatusKey } from '@/i18n/i18n-enum.gen'
import { useLocale } from '@/i18n/config'

const money = (cents: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'GBP' }).format(cents / 100)

const STATUS_COLOR: Record<OrderStatusKey, string> = {
  pending: 'gray',
  paid: 'teal',
  payment_failed: 'red',
  shipped: 'blue',
  cancelled: 'orange',
  refunded: 'violet',
}

type Props = {
  /** Set immediately after checkout, so the receipt says the purchase worked. */
  justPlaced?: boolean
}

/**
 * Where an order goes after checkout.
 *
 * `listOrders` was wired and unreachable, so a completed purchase left no trace
 * a shopper could see. Landing here from the basket is what turns "the basket
 * emptied" into "the order exists".
 */
export const OrdersPage: FC<Props> = ({ justPlaced }) => {
  useLocale()
  // Poll briefly after a checkout. `startCheckout` returns as soon as the
  // workflow is queued, so the order genuinely does not exist yet for a moment —
  // showing "no orders" to somebody who just paid would be the worst possible
  // moment to be technically accurate.
  const orders = usePikkuQuery(
    'listOrders',
    { limit: 20, offset: 0 },
    justPlaced ? { refetchInterval: 750 } : undefined,
  )

  return (
    <Stack gap="lg">
      <Box>
        <Title order={1} fz={30} fw={650} style={{ letterSpacing: '-0.02em' }}>
          {m.orders__title()}
        </Title>
        <Text c="dimmed" size="sm">
          {m.orders__subtitle()}
        </Text>
      </Box>

      {justPlaced && (
        <Alert color="teal" variant="light">
          {m.orders__just_placed()}
        </Alert>
      )}

      {orders.isError ? (
        <QueryErrorCard error={orders.error} onRetry={() => void orders.refetch()} />
      ) : orders.isLoading ? (
        <Stack gap="xs">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} h={44} radius="sm" />
          ))}
        </Stack>
      ) : (orders.data ?? []).length === 0 ? (
        <Card withBorder radius="md" p="xl">
          <Stack align="center" gap={4}>
            <Text fw={600}>{m.orders__empty_title()}</Text>
            <Text c="dimmed" size="sm">
              {m.orders__empty_hint()}
            </Text>
          </Stack>
        </Card>
      ) : (
        <Card withBorder radius="md" p={0}>
          <Table.ScrollContainer minWidth={560} type="native">
            <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{m.orders__col_order()}</Table.Th>
                  <Table.Th>{m.orders__col_status()}</Table.Th>
                  <Table.Th>{m.orders__col_total()}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(orders.data ?? []).map((order) => (
                  <Table.Tr key={order.orderId}>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {asI18n(order.orderId.slice(0, 8))}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        size="md"
                        variant="light"
                        color={STATUS_COLOR[order.status as OrderStatusKey]}
                        styles={{ label: { color: STATUS_TEXT_COLOR } }}
                      >
                        {orderStatus[order.status as OrderStatusKey]()}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {asI18n(money(order.totalCents))}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      )}
    </Stack>
  )
}
