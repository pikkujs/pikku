import React from 'react'
import { Stack, Text, Box, Group } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { Shield } from 'lucide-react'
import { PikkuBadge } from '../../ui/PikkuBadge'
import { SectionLabel } from '../../ui/SectionLabel'

interface PermissionPanelProps {
  permissionId: string
  metadata?: any
}

const DefinitionPanel: React.FC<{ defId: string; def: any }> = ({
  defId,
  def,
}) => {
  return (
    <Stack gap="lg">
      <Box>
        <Group gap="xs">
          <Shield size={20} />
          <Text size="lg" fw={600}>
            {asI18n(def.name || def.exportedName || defId)}
          </Text>
        </Group>
        {def.description && (
          <Text size="sm" c="dimmed" mt={4}>
            {asI18n(def.description)}
          </Text>
        )}
      </Box>

      <Group gap={4}>
        {def.factory && <PikkuBadge type="flag" flag="factory" />}
        {def.exportedName === null && <PikkuBadge type="flag" flag="local" />}
        {def.exportedName && (
          <PikkuBadge
            type="dynamic"
            badge="exportedName"
            value={def.exportedName}
          />
        )}
        {def.package && (
          <PikkuBadge type="dynamic" badge="package" value={def.package} />
        )}
      </Group>

      {def.services?.services?.length > 0 && (
        <Box>
          <SectionLabel>{asI18n('Services')}</SectionLabel>
          <Group gap={4}>
            {def.services.services.map((svc: string) => (
              <PikkuBadge
                key={svc}
                type="dynamic"
                badge="service"
                value={svc}
              />
            ))}
          </Group>
        </Box>
      )}

      {def.wires && (
        <Box>
          <SectionLabel>{asI18n('Wires')}</SectionLabel>
          {def.wires.wires?.length > 0 ? (
            <Group gap={4}>
              {def.wires.wires.some((w: string) =>
                [
                  'session',
                  'setSession',
                  'clearSession',
                  'getSession',
                  'hasSessionChanged',
                ].includes(w)
              ) && <PikkuBadge type="flag" flag="session" />}
              {def.wires.wires
                .filter(
                  (w: string) =>
                    ![
                      'session',
                      'setSession',
                      'clearSession',
                      'getSession',
                      'hasSessionChanged',
                    ].includes(w)
                )
                .map((w: string) => (
                  <PikkuBadge key={w} type="dynamic" badge="wire" value={w} />
                ))}
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              {asI18n('None')}
            </Text>
          )}
        </Box>
      )}
    </Stack>
  )
}

export const PermissionConfiguration: React.FC<PermissionPanelProps> = ({
  permissionId,
  metadata = {},
}) => {
  return <DefinitionPanel defId={metadata._id || permissionId} def={metadata} />
}
