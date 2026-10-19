import { useState, type FC } from 'react'
import {
  Alert, Badge, Box, Button, Card, Group, NumberInput, Select, Stack, Text, Title,
} from '@pikku/mantine/core'
import { STATUS_TEXT_COLOR } from '@/lib/status-color'
import { usePikkuQuery, usePikkuMutation } from '@project/functions-sdk/pikku/api.gen'
import { LiveFeed } from '@/components/LiveFeed'
import { m, asI18n } from '@/i18n/messages'
import { housekeepingTaskKind, housekeepingTaskStatus } from '@/i18n/i18n-enum.gen'
import type {
  HousekeepingTaskKindKey,
  HousekeepingTaskStatusKey,
} from '@/i18n/i18n-enum.gen'
import { useLocale } from '@/i18n/config'

/**
 * The desk work behind the board.
 *
 * `createBooking`, `reserveStay` (with its deposit, confirmation and guest
 * notification), `scheduleTurnover` and `sweepNoShows` were all wired, scoped
 * and unreachable — the app could show rooms and could not take a booking.
 *
 * These are the same actions the schedule and the phone produce, exposed so a
 * person can perform them too, which is what makes them observable when they
 * misbehave.
 *
 * Housekeeping and the arrivals sweep joined them for the same reason.
 * `completeHousekeepingTask` had no control because nothing listed the tasks,
 * and `sweepDueArrivals` had only its five-minute schedule — a job nobody can
 * force is a job nobody can verify or recover.
 */
export const OperationsPage: FC = () => {
  useLocale()
  const rooms = usePikkuQuery('listRooms', {})
  const arrivals = usePikkuQuery('listArrivals', {})
  const housekeeping = usePikkuQuery('listHousekeepingTasks', {})
  const createBooking = usePikkuMutation('createBooking')
  const startReservation = usePikkuMutation('startReservation')
  const scheduleTurnover = usePikkuMutation('scheduleTurnover')
  const sweepNoShows = usePikkuMutation('sweepNoShows')
  const sweepDueArrivals = usePikkuMutation('sweepDueArrivals')
  const completeHousekeepingTask = usePikkuMutation('completeHousekeepingTask')

  const [nights, setNights] = useState<number | string>(2)
  const [guests, setGuests] = useState<number | string>(2)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  // Which task is closing, not whether *a* task is closing. The mutation hook
  // has one `isPending` for the page, so keying the spinner off it lights every
  // button on the board and gives no clue which room is actually being closed.
  const [closingTask, setClosingTask] = useState<string | null>(null)

  const roomOptions = (rooms.data?.rooms ?? []).map((r) => ({ value: r.roomId, label: r.number }))
  const bookingOptions = (arrivals.data?.arrivals ?? []).map((a) => ({
    value: a.bookingId,
    label: a.guestName,
  }))
  const chosenRoom = roomId ?? roomOptions[0]?.value ?? null
  const chosenBooking = bookingId ?? bookingOptions[0]?.value ?? null

  const run = async (what: () => Promise<unknown>) => {
    setFailed(false)
    setNote(null)
    try {
      await what()
      setNote(m.ops__done())
      await Promise.all([rooms.refetch(), arrivals.refetch(), housekeeping.refetch()])
    } catch {
      setFailed(true)
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const departure = (n: number) =>
    new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

  return (
    <Stack gap="lg">
      <Box>
        <Title order={1} fz={30} fw={650} style={{ letterSpacing: '-0.02em' }}>
          {m.ops__title()}
        </Title>
        <Text c="dimmed" size="sm">{m.ops__subtitle()}</Text>
      </Box>

      {note && <Alert color="teal" variant="light">{asI18n(note)}</Alert>}
      {failed && <Alert color="red" variant="light">{m.ops__failed()}</Alert>}

      <Card withBorder radius="md" padding="lg">
        <Stack gap="sm">
          <Title order={2} fz="md" fw={600}>{m.ops__booking_title()}</Title>
          <Group align="flex-end">
            <NumberInput label={m.ops__booking_nights()} value={nights} onChange={setNights} w={120} min={1} />
            <NumberInput label={m.ops__booking_guests()} value={guests} onChange={setGuests} w={120} min={1} />
            <Button
              loading={createBooking.isPending}
              onClick={() =>
                void run(() =>
                  createBooking.mutateAsync({
                    roomTypeId: 'rt_double',
                    arrival: today,
                    departure: departure(Number(nights)),
                    guests: Number(guests),
                  }),
                )
              }
            >
              {m.ops__booking_add()}
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Stack gap="sm">
          <Title order={2} fz="md" fw={600}>{m.ops__reserve_title()}</Title>
          <Text c="dimmed" size="sm">{m.ops__reserve_body()}</Text>
          {bookingOptions.length === 0 ? (
            <Text c="dimmed" size="sm">{m.ops__nothing()}</Text>
          ) : (
            <Group align="flex-end">
              <Select data={bookingOptions} value={chosenBooking} onChange={setBookingId} allowDeselect={false} w={280} />
              <Button
                variant="default"
                loading={startReservation.isPending}
                disabled={!chosenBooking}
                onClick={() => void run(() => startReservation.mutateAsync({ bookingId: chosenBooking! }))}
              >
                {m.ops__reserve_action()}
              </Button>
            </Group>
          )}
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Stack gap="sm">
          <Title order={2} fz="md" fw={600}>{m.ops__turnover_title()}</Title>
          <Group align="flex-end">
            <Select data={roomOptions} value={chosenRoom} onChange={setRoomId} allowDeselect={false} w={200} />
            <Button
              variant="default"
              loading={scheduleTurnover.isPending}
              disabled={!chosenRoom}
              onClick={() =>
                void run(() =>
                  scheduleTurnover.mutateAsync({ roomId: chosenRoom!, priority: 'normal' }),
                )
              }
            >
              {m.ops__turnover_action()}
            </Button>
          </Group>
        </Stack>
      </Card>

      {/* The housekeeping board.
          `completeHousekeepingTask` was wired, scoped and audited and had no
          control anywhere, because nothing listed the tasks — the only way to
          obtain a task id was to read the seed file. A hotel whose housekeeper
          cannot say a room is clean leaves the front desk reading a board that
          only ever gets worse. */}
      <Card withBorder radius="md" padding="lg">
        <Stack gap="sm">
          <Title order={2} fz="md" fw={600}>{m.ops__hk_title()}</Title>
          <Text c="dimmed" size="sm">{m.ops__hk_body()}</Text>
          {housekeeping.data?.tasks.length === 0 ? (
            <Text c="dimmed" size="sm">{m.ops__hk_empty()}</Text>
          ) : (
            <Stack gap="xs">
              {(housekeeping.data?.tasks ?? []).map((task) => (
                <Group key={task.taskId} justify="space-between" wrap="nowrap">
                  <Box>
                    <Text fw={600} size="sm">
                      {m.ops__hk_room({ number: task.roomNumber })}
                    </Text>
                    {/* Two elements rather than one string with a separator:
                        the i18n gate takes only branded messages as children,
                        and a literal '·' between them is exactly the kind of
                        untranslated copy it exists to reject. */}
                    <Group gap={6} wrap="nowrap" align="center">
                      <Text c="dimmed" size="xs">
                        {housekeepingTaskKind[task.kind as HousekeepingTaskKindKey]()}
                      </Text>
                      <Badge
                        size="xs"
                        variant="light"
                        color={task.status === 'in_progress' ? 'blue' : 'orange'}
                        styles={{ label: { color: STATUS_TEXT_COLOR } }}
                      >
                        {housekeepingTaskStatus[task.status as HousekeepingTaskStatusKey]()}
                      </Badge>
                    </Group>
                  </Box>
                  <Button
                    size="xs"
                    variant="default"
                    loading={closingTask === task.taskId}
                    onClick={() =>
                      void run(async () => {
                        setClosingTask(task.taskId)
                        try {
                          await completeHousekeepingTask.mutateAsync({ taskId: task.taskId })
                        } finally {
                          setClosingTask(null)
                        }
                      })
                    }
                  >
                    {m.ops__hk_complete()}
                  </Button>
                </Group>
              ))}
            </Stack>
          )}
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Stack gap="sm">
          <Title order={2} fz="md" fw={600}>{m.ops__sweep_title()}</Title>
          <Text c="dimmed" size="sm">{m.ops__sweep_body()}</Text>
          <Group>
            <Button
              variant="default"
              loading={sweepNoShows.isPending}
              onClick={() => void run(() => sweepNoShows.mutateAsync(null))}
            >
              {m.ops__sweep_noshows()}
            </Button>
            {/* A scheduled task a person cannot trigger is a task nobody can
                verify and nobody can recover. `sweepDueArrivals` runs every
                five minutes and fires the arrival-due handler for each row it
                finds; when a desk suspects it has not run, waiting out the
                cron is not an answer. */}
            <Button
              variant="default"
              loading={sweepDueArrivals.isPending}
              onClick={() => void run(() => sweepDueArrivals.mutateAsync(null))}
            >
              {m.ops__sweep_arrivals()}
            </Button>
          </Group>
        </Stack>
      </Card>
      <LiveFeed />
    </Stack>
  )
}
