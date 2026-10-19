import type { FC } from 'react'
import { Button, Card, Group, Skeleton, Stack, Text, TextInput } from '@pikku/mantine/core'
import { useState } from 'react'
import { usePikkuQuery, usePikkuMutation } from '@project/functions-sdk/pikku/api.gen'
import { IssuesPage } from '@/pages/IssuesPage'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

type Props = { orgId: string }

/**
 * Resolves which workspace the board is for before rendering it.
 *
 * The organisation is a URL parameter on purpose — ambient tenant state is how
 * somebody posts into the wrong workspace after a browser restore. But that
 * leaves `/app/issues` with no organisation at all, which is exactly where the
 * nav sends you, so an unparameterised visit has to mean something. It means
 * the first workspace the reader belongs to, ordered by name — and the board
 * then prints which one that was, so a guess the reader can see and correct
 * beats a page that renders nothing. A switcher is the real answer; this is the
 * floor beneath it.
 */
export const IssuesRoutePage: FC<Props> = ({ orgId }) => {
  useLocale()
  // Fetched even when the URL names an organisation, because the board has to
  // say WHICH workspace it is showing — a person with two memberships cannot
  // tell from an id in the query string, and "this workspace" answers nothing.
  const orgs = usePikkuQuery('listMyOrgs', {})
  const startOnboarding = usePikkuMutation('startOnboarding')
  const [name, setName] = useState('')

  if (orgId) {
    const named = orgs.data?.organisations.find((o) => o.orgId === orgId)
    return <IssuesPage orgId={orgId} orgName={named?.name} />
  }

  if (orgs.isLoading) {
    return (
      <Stack gap="xs">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} h={44} radius="sm" />
        ))}
      </Stack>
    )
  }

  const organisations = orgs.data?.organisations ?? []

  if (organisations.length === 0) {
    return (
      <Card withBorder radius="md" p="xl">
        <Stack align="center" gap="sm">
          <Text fw={600}>{m.issues__no_org_title()}</Text>
          <Text c="dimmed" size="sm" ta="center">
            {m.issues__no_org_hint()}
          </Text>
          {/* The empty state told people to "create one" and offered no way to,
              while `onboardOrganisation` sat with three steps and no caller. */}
          <Group align="flex-end" mt="xs">
            <TextInput
              label={m.issues__workspace_name()}
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              w={260}
            />
            <Button
              loading={startOnboarding.isPending}
              disabled={!name.trim()}
              onClick={() =>
                startOnboarding
                  .mutateAsync({
                    name: name.trim(),
                    slug: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                  })
                  .then(() => orgs.refetch())
              }
            >
              {m.issues__create_workspace()}
            </Button>
          </Group>
        </Stack>
      </Card>
    )
  }

  const first = organisations[0]!
  return <IssuesPage orgId={first.orgId} orgName={first.name} />
}
