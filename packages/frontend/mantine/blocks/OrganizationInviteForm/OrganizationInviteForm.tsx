import { useState } from 'react'
import {
  Alert,
  Button,
  Group,
  Paper,
  type PaperProps,
  Select,
  Stack,
  TextInput,
  Title,
} from '@pikku/mantine/core'
import { useMutation } from '@tanstack/react-query'
import { Mail } from 'lucide-react'
import { m } from '@/i18n/messages'
import { asI18n } from '@pikku/react'
import { inviteMember, type OrgRole } from './org-auth'

// Invite a teammate to the active organization by email + role. On success Better
// Auth sends the invitation (wire sendInvitationEmail in your auth config) and this
// clears the field. Feedback is inline via useMutation — never a toast.
export function OrganizationInviteForm(props: PaperProps) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<OrgRole>('member')

  const invite = useMutation({
    mutationFn: () => inviteMember({ email, role }),
    onSuccess: () => setEmail(''),
  })

  return (
    <Paper withBorder p="lg" radius="md" {...props}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          invite.mutate()
        }}
      >
        <Stack gap="md">
          <Title order={4}>{m.organizationinviteform__title()}</Title>
          <Group align="flex-end" gap="sm" wrap="nowrap">
            <TextInput
              style={{ flex: 1 }}
              type="email"
              required
              leftSection={<Mail size={16} />}
              label={m.organizationinviteform__email_label()}
              placeholder={m.organizationinviteform__email_placeholder()}
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
            <Select
              w={140}
              label={m.organizationinviteform__role_label()}
              value={role}
              onChange={(v) => setRole((v as OrgRole) ?? 'member')}
              data={[
                { value: 'member', label: asI18n('Member') },
                { value: 'admin', label: asI18n('Admin') },
                { value: 'owner', label: asI18n('Owner') },
              ]}
            />
          </Group>
          {invite.isError && (
            <Alert color="red" variant="light">
              {asI18n(invite.error.message)}
            </Alert>
          )}
          {invite.isSuccess && (
            <Alert color="green" variant="light">
              {m.organizationinviteform__sent()}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button type="submit" loading={invite.isPending}>
              {m.organizationinviteform__submit()}
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  )
}
