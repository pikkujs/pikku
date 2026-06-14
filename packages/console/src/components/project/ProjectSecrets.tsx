import React, { useMemo } from 'react'
import { Text, Group } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { KeyRound } from 'lucide-react'
import { usePanelContext } from '../../context/PanelContext'
import { TableListPage } from '../layout/TableListPage'
import { PikkuBadge } from '../ui/PikkuBadge'

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
  emptyHero?: React.ReactNode
}

export const ProjectSecrets: React.FC<ProjectSecretsProps> = ({
  secrets,
  loading,
  installed = true,
  emptyHero,
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
                {asI18n(s.displayName)}
              </Text>
              {s.isOAuth2 && (
                <PikkuBadge type="label" color="gray">
                  {asI18n('OAuth2')}
                </PikkuBadge>
              )}
            </Group>
            {s.description && (
              <Text size="sm" c="dimmed" truncate>
                {asI18n(s.description)}
              </Text>
            )}
          </>
        ),
      },
      {
        key: 'secretId',
        header: 'SECRET ID',
        render: (s: SecretMeta) => (
          <Text size="sm" c="dimmed" ff="monospace">
            {asI18n(s.secretId)}
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
      docsHref="https://pikku.dev/docs/core-features/secrets"
      data={secrets}
      columns={columns}
      getKey={(s) => s.name}
      onRowClick={(s) => openSecret(s.name, { ...(s.rawData ?? s), installed })}
      emptyMessage={asI18n('No secrets found.')}
      loading={loading}
      emptyHero={emptyHero}
    />
  )
}
