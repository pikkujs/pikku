import { useState, type FC } from 'react'
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@pikku/mantine/core'
import { QueryErrorCard } from '@/components/QueryErrorCard'
import { STATUS_TEXT_COLOR } from '@/lib/status-color'
import { usePikkuQuery, usePikkuMutation } from '@project/functions-sdk/pikku/api.gen'
import { m, asI18n } from '@/i18n/messages'
import { bookingStatus } from '@/i18n/i18n-enum.gen'
import type { BookingStatusKey } from '@/i18n/i18n-enum.gen'
import { useLocale } from '@/i18n/config'

const STATUS_COLOR: Record<string, string> = {
  held: 'gray',
  confirmed: 'blue',
  checked_in: 'teal',
  checked_out: 'gray',
  cancelled: 'orange',
  no_show: 'red',
}

/**
 * The desk's actual job.
 *
 * `checkIn` takes a booking id, and nothing in this app ever showed one — the
 * front desk lists rooms, and a room does not tell you who is standing at the
 * counter. So the one action a receptionist performs all day was reachable only
 * from an RPC scenario that already knew the id.
 */
export const ArrivalsPage: FC = () => {
  useLocale()
  const arrivals = usePikkuQuery('listArrivals', {})
  const checkIn = usePikkuMutation('checkIn')
  const [failed, setFailed] = useState(false)

  const rows = arrivals.data?.arrivals ?? []
  const waiting = rows.filter((a) => a.status !== 'checked_in').length

  const admit = async (bookingId: string) => {
    setFailed(false)
    try {
      await checkIn.mutateAsync({ bookingId })
      await arrivals.refetch()
    } catch {
      setFailed(true)
    }
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Box>
          <Title order={1} fz={30} fw={650} style={{ letterSpacing: '-0.02em' }}>
            {m.arrivals__title()}
          </Title>
          <Text c="dimmed" size="sm">
            {m.arrivals__subtitle()}
          </Text>
        </Box>
        {!arrivals.isLoading && waiting > 0 && (
          <Badge
            size="lg"
            variant="light"
            color="blue"
            styles={{ label: { color: STATUS_TEXT_COLOR } }}
          >
            {m.arrivals__waiting({ count: waiting })}
          </Badge>
        )}
      </Group>

      {failed && (
        <Alert color="red" variant="light">
          {m.arrivals__failed()}
        </Alert>
      )}

      {arrivals.isError ? (
        <QueryErrorCard error={arrivals.error} onRetry={() => void arrivals.refetch()} />
      ) : arrivals.isLoading ? (
        <Stack gap="xs">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} h={64} radius="md" />
          ))}
        </Stack>
      ) : rows.length === 0 ? (
        <Card withBorder radius="md" p="xl">
          <Stack align="center" gap={4}>
            <Text fw={600}>{m.arrivals__empty_title()}</Text>
            <Text c="dimmed" size="sm">
              {m.arrivals__empty_hint()}
            </Text>
          </Stack>
        </Card>
      ) : (
        <Stack gap="xs">
          {rows.map((arrival) => (
            <Card key={arrival.bookingId} withBorder radius="md" padding="md">
              <Group justify="space-between" align="center" wrap="wrap" gap="sm">
                <Stack gap={4}>
                  <Group gap="xs" align="center">
                    <Text fw={600}>{asI18n(arrival.guestName)}</Text>
                    <Badge
                      size="md"
                      variant="light"
                      color={STATUS_COLOR[arrival.status] ?? 'gray'}
                      styles={{ label: { color: STATUS_TEXT_COLOR } }}
                    >
                      {bookingStatus[arrival.status as BookingStatusKey]?.() ??
                        asI18n(arrival.status)}
                    </Badge>
                  </Group>
                  <Text c="dimmed" size="xs">
                    {asI18n(
                      `${arrival.roomType} · ${arrival.nights} nights · ${arrival.guests} guests`,
                    )}
                  </Text>
                </Stack>

                {arrival.roomNumber ? (
                  <Text size="sm" fw={600} style={{ flexShrink: 0 }}>
                    {m.arrivals__in_room({ number: arrival.roomNumber })}
                  </Text>
                ) : (
                  <Button
                    size="sm"
                    loading={checkIn.isPending && checkIn.variables?.bookingId === arrival.bookingId}
                    onClick={() => void admit(arrival.bookingId)}
                    style={{ flexShrink: 0 }}
                  >
                    {m.arrivals__check_in()}
                  </Button>
                )}
              </Group>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  )
}
