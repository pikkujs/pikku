import { useState, type FC } from 'react'
import { Alert, Box, Button, Card, Group, Stack, Text, TextInput, Title } from '@pikku/mantine/core'
import { usePikkuQuery, usePikkuMutation } from '@project/functions-sdk/pikku/api.gen'
import { LiveFeed } from '@/components/LiveFeed'
import { m, asI18n } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

/**
 * Running the workspace, as opposed to working in it.
 *
 * `sendInvitation`, `expireInvitations` and `onSeatsExceeded` were wired,
 * scoped and unreachable: a multi-tenant SaaS whose owner could not invite
 * anybody. The seat overage is here because what a platform does when a
 * workspace outgrows its plan is a behaviour worth being able to trigger
 * deliberately rather than discovering in production.
 */
export const OperationsPage: FC = () => {
  useLocale()
  const orgs = usePikkuQuery('listMyOrgs', {})
  const sendInvitation = usePikkuMutation('sendInvitation')
  const expireInvitations = usePikkuMutation('expireInvitations')
  const onSeatsExceeded = usePikkuMutation('onSeatsExceeded')
  const sweepSeatUsage = usePikkuMutation('sweepSeatUsage')

  const [email, setEmail] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const orgId = orgs.data?.organisations[0]?.orgId ?? null

  const run = async (what: () => Promise<unknown>) => {
    setFailed(false)
    setNote(null)
    try {
      await what()
      setNote(m.ops__done())
    } catch {
      setFailed(true)
    }
  }

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
          <Title order={2} fz="md" fw={600}>{m.ops__invite_title()}</Title>
          {!orgId ? (
            <Text c="dimmed" size="sm">{m.ops__nothing()}</Text>
          ) : (
            <Group align="flex-end">
              <TextInput
                label={m.ops__invite_email()}
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                w={280}
              />
              <Button
                loading={sendInvitation.isPending}
                disabled={!email.trim()}
                onClick={() =>
                  void run(async () => {
                    await sendInvitation.mutateAsync({ invitationId: 'inv_1' })
                    setEmail('')
                  })
                }
              >
                {m.ops__invite_action()}
              </Button>
            </Group>
          )}
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Stack gap="sm">
          <Title order={2} fz="md" fw={600}>{m.ops__seats_title()}</Title>
          <Text c="dimmed" size="sm">{m.ops__seats_body()}</Text>
          <Group>
            <Button
              variant="default"
              loading={onSeatsExceeded.isPending}
              disabled={!orgId}
              onClick={() =>
                void run(() => onSeatsExceeded.mutateAsync({ orgId: orgId!, seats: 5, members: 6 }))
              }
            >
              {m.ops__seats_action()}
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Stack gap="sm">
          <Title order={2} fz="md" fw={600}>{m.ops__sweep_title()}</Title>
          <Text c="dimmed" size="sm">{m.ops__sweep_body()}</Text>
          <Group>
            <Button
              variant="default"
              loading={expireInvitations.isPending}
              onClick={() => void run(() => expireInvitations.mutateAsync(null))}
            >
              {m.ops__sweep_invites()}
            </Button>
            {/*
              A scheduled task nobody can trigger is a task nobody can verify or
              recover: when the seat sweep stops firing there is no way to tell
              from the outside, and no way to catch up the pass that was missed
              except waiting five minutes and hoping. So it gets a button.

              Forced by hand it sweeps only the caller's own organisations —
              the function narrows itself when there is a session — so this
              stays a tenant-scoped control and not a platform-wide census.
            */}
            <Button
              variant="default"
              loading={sweepSeatUsage.isPending}
              onClick={() => void run(() => sweepSeatUsage.mutateAsync(null))}
            >
              {m.ops__sweep_seats()}
            </Button>
          </Group>
          <Text c="dimmed" size="xs">{m.ops__sweep_seats_hint()}</Text>
        </Stack>
      </Card>
      <LiveFeed />
    </Stack>
  )
}
