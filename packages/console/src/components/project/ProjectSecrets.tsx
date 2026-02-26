import React, { useMemo } from 'react'
import { Text, Group } from '@mantine/core'
import { KeyRound } from 'lucide-react'
import { usePanelContext } from '@/context/PanelContext'
import { TableListPage } from '@/components/layout/TableListPage'
import { PikkuBadge } from '@/components/ui/PikkuBadge'

export interface SecretMeta {
  name: string
  displayName: string
  description?: string
  secretId: string
  isOAuth2?: boolean
  rawData?: any
}

interface ProjectSecretsProps {
  secrets: SecretMeta[]
  loading?: boolean
  installed?: boolean
}

export const ProjectSecrets: React.FunctionComponent<ProjectSecretsProps> = ({
  secrets,
  loading,
  installed = true,
}) => {
  const { openSecret } = usePanelContext()

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'NAME',
        render: (s: SecretMeta) => (
          <>
            <Group gap="xs">
              <Text fw={500} truncate>
                {s.displayName}
              </Text>
              {s.isOAuth2 && (
                <PikkuBadge type="label" color="violet">
                  OAuth2
                </PikkuBadge>
              )}
            </Group>
            {s.description && (
              <Text size="xs" c="dimmed" truncate>
                {s.description}
              </Text>
            )}
          </>
        ),
      },
      {
        key: 'secretId',
        header: 'SECRET ID',
        render: (s: SecretMeta) => (
          <Text size="xs" c="dimmed" ff="monospace">
            {s.secretId}
          </Text>
        ),
      },
    ],
    []
  )

  return (
    <TableListPage
      title="Secrets"
      icon={KeyRound}
      docsHref="https://pikkujs.com/docs/secrets"
      data={secrets}
      columns={columns}
      getKey={(s) => s.name}
      onRowClick={(s) => openSecret(s.name, { ...(s.rawData ?? s), installed })}
      searchPlaceholder="Search secrets..."
      searchFilter={(s, q) =>
        s.name.toLowerCase().includes(q) ||
        s.displayName.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q) ||
        s.secretId.toLowerCase().includes(q) ||
        false
      }
      emptyMessage="No secrets found."
      loading={loading}
    />
  )
}
