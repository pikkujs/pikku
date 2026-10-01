import { Container, Stack, Text, Title } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { OrganizationInviteForm } from './OrganizationInviteForm'
import { OrganizationMembersTable } from './OrganizationMembersTable'

// A complete team-settings screen: page header + invite form + members table,
// all wired to the Better Auth organization client. Use as the body of a
// /app/team (or /settings/team) route. Needs the organization() plugin enabled
// and migrated.
export function TeamSettingsScreen() {
  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        <Stack gap={4}>
          <Title order={2}>{m.teamsettingsscreen__title()}</Title>
          <Text c="dimmed">{m.teamsettingsscreen__subtitle()}</Text>
        </Stack>
        <OrganizationInviteForm />
        <OrganizationMembersTable />
      </Stack>
    </Container>
  )
}
