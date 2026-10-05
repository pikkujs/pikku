import { Button, Group, Loader, Menu, Text } from '@pikku/mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, Building2 } from 'lucide-react'
import { m } from '@/i18n/messages'
import { asI18n } from '@pikku/react'
import { listOrganizations, setActiveOrganization } from './org-auth'

// A header dropdown that lists the user's organizations and switches the active one.
// setActive updates the session's active org; invalidating queries refreshes any
// org-scoped data. `activeId` marks the current org with a check.
export function OrganizationSwitcher({ activeId }: { activeId?: string }) {
  const qc = useQueryClient()
  const orgs = useQuery({ queryKey: ['org', 'list'], queryFn: () => listOrganizations() })
  const switchOrg = useMutation({
    mutationFn: (organizationId: string) => setActiveOrganization(organizationId),
    onSuccess: () => qc.invalidateQueries(),
  })

  const active = orgs.data?.find((o) => o.id === activeId)

  return (
    <Menu position="bottom-start" width={220} withinPortal>
      <Menu.Target>
        <Button
          variant="default"
          leftSection={<Building2 size={16} />}
          rightSection={<ChevronDown size={16} />}
          loading={orgs.isPending || switchOrg.isPending}
        >
          {active ? asI18n(active.name) : m.organizationswitcher__select()}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{m.organizationswitcher__label()}</Menu.Label>
        {orgs.isError ? (
          <Menu.Item disabled c="red">
            {asI18n(orgs.error.message)}
          </Menu.Item>
        ) : orgs.data && orgs.data.length > 0 ? (
          orgs.data.map((o) => (
            <Menu.Item
              key={o.id}
              onClick={() => switchOrg.mutate(o.id)}
              rightSection={o.id === activeId ? <Check size={16} /> : undefined}
            >
              {asI18n(o.name)}
            </Menu.Item>
          ))
        ) : orgs.isPending ? (
          <Group justify="center" p="sm">
            <Loader size="xs" />
          </Group>
        ) : (
          <Text size="sm" c="dimmed" p="sm">
            {m.organizationswitcher__empty()}
          </Text>
        )}
      </Menu.Dropdown>
    </Menu>
  )
}
