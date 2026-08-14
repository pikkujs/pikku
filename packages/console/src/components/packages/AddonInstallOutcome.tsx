import React from 'react'
import { Alert, Badge, Group, List, Stack, Text } from '@pikku/mantine/core'
import { AlertTriangle, Check, RotateCw } from 'lucide-react'
import { m } from '@/i18n/messages'
import type { AddonInstallResult } from './installResult'

type AddonInstallOutcomeProps = {
  namespace: string
  result: AddonInstallResult
}

/**
 * What the install itself reported, rendered instead of waiting for the addon
 * to become queryable. The server has to re-inspect the new wiring before that
 * happens — and a server that is not `pikku dev` never will — so this is the
 * only account of the install the user is guaranteed to see.
 */
export const AddonInstallOutcome: React.FC<AddonInstallOutcomeProps> = ({
  namespace,
  result,
}) => {
  // The label carries the name, rather than English concatenated around it —
  // a renamed message then fails the build instead of degrading at runtime.
  const missing = [
    ...result.missingSecrets.map((name) => ({
      key: `secret-${name}`,
      label: m.packages_install_missing_secret({ name }),
    })),
    ...result.missingVariables.map((name) => ({
      key: `variable-${name}`,
      label: m.packages_install_missing_variable({ name }),
    })),
  ]

  return (
    <Stack gap="md" data-testid="addon-install-outcome">
      <Group gap="xs">
        <Check size={18} />
        <Text fw={600}>{m.packages_install_installed_as({ namespace })}</Text>
      </Group>

      {result.restartRequired && (
        <Group gap="xs" data-testid="addon-install-restart-required">
          <RotateCw size={16} />
          <Text size="sm">{m.packages_install_restart_required()}</Text>
        </Group>
      )}

      {missing.length === 0 ? (
        <Badge color="green" data-testid="addon-install-ready">
          {m.packages_install_ready()}
        </Badge>
      ) : (
        <Alert
          color="yellow"
          icon={<AlertTriangle size={16} />}
          title={m.packages_install_missing_title()}
          data-testid="addon-install-missing"
        >
          <List size="sm">
            {missing.map(({ key, label }) => (
              <List.Item key={key} data-testid="addon-install-missing-item">
                {label}
              </List.Item>
            ))}
          </List>
        </Alert>
      )}
    </Stack>
  )
}
