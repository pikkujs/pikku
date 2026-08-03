import React from 'react'
import { Badge, Box, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import type { PersonaRoleRef } from './persona-types'

export interface PersonaRoleListProps {
  roles: PersonaRoleRef[]
}

/**
 * A persona's system roles, each opened up into the scopes it grants.
 *
 * The expansion is shown rather than summarised because the two halves fail
 * differently: a persona holds *roles*, and a function checks *scopes*. Reading
 * "buyer" off a profile and then reading `orders:create` off a 403 is two
 * lookups in two places, and printing the roles alone leaves the second one to
 * be done by hand every time.
 */
export const PersonaRoleList: React.FC<PersonaRoleListProps> = ({ roles }) => {
  if (roles.length === 0) {
    return (
      <Text size="xs" c="dimmed">
        {m.personas_no_roles_explained()}
      </Text>
    )
  }

  return (
    <Stack gap={8}>
      {roles.map((role) => (
        <Box
          key={role.name}
          data-testid={`persona-role-${role.name}`}
          style={{
            border: '1px solid var(--mantine-color-default-border)',
            borderRadius: 8,
            padding: '8px 12px',
          }}
        >
          <Group gap={8} wrap="nowrap" align="center">
            <Text size="sm" fw={600}>
              {asI18n(role.displayName ?? role.name)}
            </Text>
            {role.displayName && (
              <Text size="xs" ff="monospace" c="dimmed">
                {asI18n(role.name)}
              </Text>
            )}
            {!role.declared && (
              <Badge variant="light" color="red" radius="sm" tt="none" fw={500}>
                {m.personas_role_undeclared()}
              </Badge>
            )}
          </Group>
          {role.description && (
            <Text size="xs" c="dimmed" mt={2}>
              {asI18n(role.description)}
            </Text>
          )}
          {role.scopes.length > 0 ? (
            <Group gap={4} wrap="wrap" mt={6}>
              {role.scopes.map((scope) => (
                <Badge
                  key={scope}
                  variant="default"
                  radius="sm"
                  tt="none"
                  fw={500}
                  styles={{
                    label: {
                      fontFamily: 'var(--mantine-font-family-monospace)',
                    },
                  }}
                >
                  {asI18n(scope)}
                </Badge>
              ))}
            </Group>
          ) : (
            <Text size="xs" c="dimmed" mt={6}>
              {role.declared
                ? m.personas_role_no_scopes()
                : m.personas_role_undeclared_explained()}
            </Text>
          )}
        </Box>
      ))}
    </Stack>
  )
}
