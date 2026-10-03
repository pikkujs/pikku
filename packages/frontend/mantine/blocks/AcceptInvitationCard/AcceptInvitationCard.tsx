import {
  Alert,
  Button,
  Group,
  Paper,
  type PaperProps,
  Stack,
  Text,
  Title,
} from '@pikku/mantine/core'
import { useMutation } from '@tanstack/react-query'
import { m } from '@/i18n/messages'
import { asI18n } from '@pikku/react'
import { acceptInvitation, rejectInvitation } from './org-auth'

// The landing card for an org invitation link (?invitationId=…). Accept joins the
// org; decline rejects it. Both call the Better Auth organization client and report
// inline; onAccepted lets the page redirect into the app after joining.
export function AcceptInvitationCard({
  invitationId,
  organizationName,
  onAccepted,
  ...props
}: PaperProps & { invitationId: string; organizationName?: string; onAccepted?: () => void }) {
  const accept = useMutation({
    mutationFn: () => acceptInvitation(invitationId),
    onSuccess: () => onAccepted?.(),
  })
  const decline = useMutation({ mutationFn: () => rejectInvitation(invitationId) })
  const busy = accept.isPending || decline.isPending

  if (decline.isSuccess) {
    return (
      <Paper withBorder p="xl" radius="md" {...props}>
        <Text c="dimmed">{m.acceptinvitationcard__declined()}</Text>
      </Paper>
    )
  }

  return (
    <Paper withBorder p="xl" radius="md" maw={420} {...props}>
      <Stack gap="md">
        <Title order={3}>{m.acceptinvitationcard__title()}</Title>
        <Text c="dimmed">
          {organizationName ? asI18n(organizationName) : m.acceptinvitationcard__generic()}
        </Text>
        {accept.isError && (
          <Alert color="red" variant="light">
            {asI18n(accept.error.message)}
          </Alert>
        )}
        {decline.isError && (
          <Alert color="red" variant="light">
            {asI18n(decline.error.message)}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={() => decline.mutate()} disabled={busy}>
            {m.acceptinvitationcard__decline()}
          </Button>
          <Button
            onClick={() => accept.mutate()}
            loading={accept.isPending}
            disabled={decline.isPending}
          >
            {m.acceptinvitationcard__accept()}
          </Button>
        </Group>
      </Stack>
    </Paper>
  )
}
