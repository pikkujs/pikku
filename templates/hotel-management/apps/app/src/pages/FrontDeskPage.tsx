import type { FC } from 'react'
import {
  Badge,
  Box,
  Card,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@pikku/mantine/core'
import { QueryErrorCard } from '@/components/QueryErrorCard'
import { STATUS_TEXT_COLOR } from '@/lib/status-color'
import { usePikkuQuery } from '@project/functions-sdk/pikku/api.gen'
import { m, asI18n } from '@/i18n/messages'
import { roomHousekeepingStatus } from '@/i18n/i18n-enum.gen'
import type { RoomHousekeepingStatusKey } from '@/i18n/i18n-enum.gen'
import { useLocale } from '@/i18n/config'

/**
 * Housekeeping status drives the colour, because that is the only thing the
 * desk is scanning for. A receptionist with an arrival waiting is asking one
 * question — "what can I put them in" — and the answer is the green ones.
 *
 * Only the colour is declared here. The *labels* come from the generated
 * `roomHousekeepingStatus` map, which is typed `Record<RoomHousekeepingStatus, …>`
 * against the database's own CHECK constraint — so adding a state to the schema
 * and forgetting to translate it fails the build instead of rendering
 * `out_of_service` at a guest-facing desk.
 */
const STATUS_COLOR: Record<RoomHousekeepingStatusKey, string> = {
  clean: 'teal',
  inspected: 'blue',
  dirty: 'orange',
  out_of_service: 'red',
}

export const FrontDeskPage: FC = () => {
  useLocale()

  const rooms = usePikkuQuery('listRooms', {})

  // Grouped by floor because that is how housekeeping actually works a shift,
  // and how a receptionist thinks about where to put somebody.
  const byFloor = (rooms.data?.rooms ?? []).reduce<
    Record<number, NonNullable<typeof rooms.data>['rooms']>
  >((acc, room) => {
    ;(acc[room.floor] ??= []).push(room)
    return acc
  }, {})

  const readyCount = (rooms.data?.rooms ?? []).filter(
    (r) => r.housekeepingStatus === 'clean' || r.housekeepingStatus === 'inspected'
  ).length

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Box>
          <Title order={1} fz={30} fw={650} style={{ letterSpacing: '-0.02em' }}>
            {m.frontdesk__title()}
          </Title>
          <Text c="dimmed" size="sm">
            {m.frontdesk__subtitle()}
          </Text>
        </Box>
        {!rooms.isLoading && (
          <Badge
            size="lg"
            variant="light"
            color="teal"
            styles={{ label: { color: STATUS_TEXT_COLOR } }}
          >
            {m.frontdesk__ready({ count: readyCount })}
          </Badge>
        )}
      </Group>

      {rooms.isError ? (
        <QueryErrorCard error={rooms.error} onRetry={() => void rooms.refetch()} />
      ) : rooms.isLoading ? (
        <SimpleGrid cols={{ base: 2, sm: 4, lg: 6 }} spacing="sm">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} h={92} radius="md" />
          ))}
        </SimpleGrid>
      ) : rooms.data?.rooms.length === 0 ? (
        // Without this branch a hotel with no rooms rendered as a heading over
        // blank space — indistinguishable from a page that failed to draw.
        <Card withBorder radius="md" p="xl">
          <Stack align="center" gap={4}>
            <Text fw={600}>{m.frontdesk__empty_title()}</Text>
            <Text c="dimmed" size="sm">
              {m.frontdesk__empty_hint()}
            </Text>
          </Stack>
        </Card>
      ) : (
        Object.entries(byFloor)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([floor, floorRooms]) => (
            <Stack key={floor} gap="xs">
              {/* Each floor is a section of the board, so its label is a
                  heading rather than styled text. */}
              <Title order={2} fw={600} fz="sm" c="dimmed" tt="uppercase" lts="0.04em">
                {m.frontdesk__floor({ floor })}
              </Title>
              <SimpleGrid cols={{ base: 2, sm: 4, lg: 6 }} spacing="sm">
                {floorRooms.map((room) => {
                  const state = room.housekeepingStatus as RoomHousekeepingStatusKey
                  return (
                    <Card key={room.roomId} withBorder radius="md" padding="sm">
                      <Stack gap={6}>
                        {/* A dot and a label, not a Badge.
                            A pill carries ~20px of horizontal padding and a pill
                            shape it will not give up, so in a 106px card it has
                            to lose letters instead — and Mantine's Card sets
                            `overflow: hidden`, so at the `sm: 4` breakpoint the
                            loss was a hard slice through "OUT OF S" with no
                            ellipsis to admit it. Two earlier attempts only moved
                            which layer absorbed the overflow: `flexShrink: 0`
                            turned ellipsis into a hard cut, and wrapping narrowed
                            it to one width. A dot plus text has no intrinsic
                            width to defend — it wraps like prose — and reads at
                            12px instead of the Badge's 9px. */}
                        {/* Number on its own line, status beneath it, for every
                            room. Sharing a line worked until a label was long
                            enough to wrap, at which point the single card that
                            most needs scanning — the out-of-service one — was
                            also the only card laid out differently from its
                            neighbours. A regular grid beats a compact one. */}
                        <Text fw={700} fz="lg" lh={1}>
                          {asI18n(room.number)}
                        </Text>
                        <Group gap={6} wrap="nowrap" align="center">
                            <Box
                              w={8}
                              h={8}
                              style={{
                                flexShrink: 0,
                                borderRadius: '50%',
                                background: `var(--mantine-color-${STATUS_COLOR[state]}-6)`,
                              }}
                            />
                            <Text
                              size="xs"
                              fw={600}
                              c={STATUS_TEXT_COLOR}
                              lh={1.2}
                            >
                              {roomHousekeepingStatus[state]()}
                            </Text>
                        </Group>
                        <Text c="dimmed" size="xs">
                          {asI18n(room.roomType)}
                        </Text>
                      </Stack>
                    </Card>
                  )
                })}
              </SimpleGrid>
            </Stack>
          ))
      )}
    </Stack>
  )
}
